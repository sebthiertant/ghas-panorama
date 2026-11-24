/* GHAS Panorama: theme, QR codes, workflow labels, headline routes and presentation mode. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const html = document.documentElement;
  const canonical = $('link[rel="canonical"]');
  const BASE = canonical ? canonical.href : location.href.split("#")[0];
  const prettyUrl = (url) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  /* ---------- Theme: dark by default, light on demand ---------- */
  const THEME_KEY = "ghas-pano-theme";
  const themeMeta = $('meta[name="theme-color"]');

  function setTheme(theme, persist) {
    html.dataset.theme = theme;
    if (themeMeta) themeMeta.content = theme === "light" ? "#ffffff" : "#0d1117";
    const other = theme === "light" ? "dark" : "light";
    $$("[data-theme-toggle]").forEach((btn) => {
      btn.setAttribute("aria-label", `Switch to ${other} theme`);
      btn.title = `Switch to ${other} theme (T)`;
    });
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* storage unavailable */ }
    }
  }
  const toggleTheme = () => setTheme(html.dataset.theme === "light" ? "dark" : "light", true);
  setTheme(html.dataset.theme === "light" ? "light" : "dark", false);

  /* ---------- QR codes (black on white, 4-module quiet zone) ---------- */
  function qrSvg(text) {
    if (typeof window.qrcode !== "function") return "";
    const qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    const size = n + quiet * 2;
    let d = "";
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) { c++; continue; }
        const start = c;
        while (c < n && qr.isDark(r, c)) c++;
        d += `M${start + quiet} ${r + quiet}h${c - start}v1h-${c - start}z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" focusable="false"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  const pageQr = qrSvg(BASE);
  $$("[data-qr-render]").forEach((el) => { el.innerHTML = pageQr; });
  $$("[data-qr-url]").forEach((el) => { el.textContent = prettyUrl(BASE); });

  /* ---------- Workflow-scoped usage labels and public sources ---------- */
  const docs = "https://docs.github.com/en/";
  const billing = docs + "billing/concepts/product-billing/github-advanced-security#how-ai-feature-usage-is-billed";
  const copilotPlans = docs + "copilot/get-started/plans";
  const autofix = docs + "code-security/concepts/code-scanning/autofix-for-code-scanning";
  const onDemand = "https://github.blog/changelog/2026-11-17-secret-scanning-on-demand-for-developers-and-agents/";
  const usage = {
    dependabot: {
      credits: true, copilot: true, scope: "Copilot assignment only",
      note: "Standard Dependabot alerts and updates do not use Copilot. Assigning an alert to Copilot starts an agent session using your enabled Copilot access and AI credits. Alert assignment also requires Code Security, including on public repositories.",
      sources: [[docs + "code-security/concepts/supply-chain-security/dependabot-alerts", "Alert assignment"], [copilotPlans, "Copilot access and usage"]],
    },
    "ai-detected-secrets": {
      credits: true, scope: "AI push protection only",
      note: "Scanning for AI-detected secrets does not require a Copilot subscription. The AI-credit label applies specifically to optional push protection for AI-detected secrets, not to all secret scanning. Each scanned push can consume Secret Protection AI credits even when nothing is blocked.",
      sources: [[docs + "code-security/how-tos/secure-your-secrets/detect-secret-leaks/enabling-secret-scanning-for-ai-detected-secrets", "Scanning access"], [billing, "AI push protection billing"]],
    },
    "agent-secret-scanning": {
      credits: true, copilot: true, scope: "On-demand Copilot workflow",
      note: "On-demand scanning in Copilot CLI, the app, SDK integrations and code review consumes Secret Protection AI credits. No additional plan is required for these Copilot experiences; SDK authentication requirements still apply. These labels describe that on-demand workflow, not the separate GitHub MCP Server integration.",
      sources: [[onDemand, "On-demand availability and billing"]],
    },
    "ai-scan": {
      credits: true,
      note: "Pull-request scans and on-demand repository scans consume Code Security AI credits, including eligible public repositories. No Copilot license is required. Eligible included credits are used first; further usage is metered and subject to budgets.",
      sources: [[docs + "code-security/concepts/code-scanning/ai-powered-security-detections", "Pull-request scans"], [docs + "code-security/concepts/code-scanning/ai-scan-for-repositories", "Repository scans"], [billing, "AI-credit billing"]],
    },
    "copilot-autofix": {
      credits: true, scope: "Agentic autofix only",
      note: "Classic Copilot Autofix suggestions do not consume AI credits. Assigning alerts to agentic autofix consumes Code Security AI credits and Actions minutes. Agentic autofix does not require a Copilot license; repository eligibility and administrator enablement still apply.",
      sources: [[autofix, "Autofix access and usage"], [billing, "AI-credit billing"]],
    },
    "security-campaigns": {
      credits: true, scope: "Agentic fixes only",
      note: "The label applies when you assign campaign alerts to agentic autofix: each assignment starts a session that consumes Code Security AI credits and Actions minutes. Creating or tracking a campaign is not the metered action. Classic Autofix suggestions do not consume AI credits.",
      sources: [[autofix, "Agentic autofix in campaigns"]],
    },
    "ai-apps-scanning": {
      credits: true,
      note: "AI applications scanning consumes AI credits in addition to its Advanced Security license requirement. Eligible public repositories are also included in this billing requirement. Preview availability and enablement rules apply.",
      sources: [[docs + "code-security/concepts/code-scanning/ai-applications-scanning-for-pull-requests", "AI application scanning billing"]],
    },
    "agent-validation": {
      copilot: true, scope: "For the Copilot workflow",
      note: "The Copilot workflow uses your enabled Copilot agent access. Automatic security validation itself requires no Advanced Security license; the underlying agent session has its own usage and compute billing. Supported third-party agents follow their own access requirements. This is not a separate license for the security checks.",
      sources: [["https://github.blog/changelog/2026-06-09-security-validation-for-third-party-coding-agents/", "Security validation"], [copilotPlans, "Copilot access and usage"]],
    },
  };
  const usageChip = (kind) => `<span class="usage-chip usage-${kind}"><svg class="octicon" aria-hidden="true"><use href="assets/icons.svg#${kind === "credits" ? "sparkle-fill" : "copilot"}"/></svg>${kind === "credits" ? "AI credits" : "Copilot access"}</span>`;
  for (const [id, info] of Object.entries(usage)) {
    const tile = document.getElementById(id);
    const top = $(".tile-top", tile);
    const flags = document.createElement("div");
    flags.className = "usage-flags";
    const status = $(".pill", top);
    if (status) flags.append(status);
    const label = document.createElement("div");
    label.className = "usage-label";
    label.id = `${id}-usage`;
    const chips = (info.credits ? usageChip("credits") : "") + (info.copilot ? usageChip("copilot") : "");
    label.innerHTML = `<div class="usage-chips">${chips}</div>${info.scope ? `<small>${info.scope}</small>` : ""}`;
    flags.append(label);
    top.append(flags);
    $(".tile-open", tile).setAttribute("aria-describedby", label.id);
    const note = document.createElement("section");
    note.className = "usage-detail";
    note.innerHTML = `<h4>AI usage &amp; access</h4><div class="usage-chips">${chips}</div><p>${info.note}</p><ul class="d-links">${info.sources.map(([url, title]) => `<li><a href="${url}">${title}</a></li>`).join("")}</ul>`;
    $(".d-lede", tile).after(note);
  }

  /* ---------- Non-crossing headline routes ---------- */
  const main = $("#main");
  const rails = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  rails.setAttribute("class", "relation-rails");
  rails.setAttribute("aria-hidden", "true");
  main.prepend(rails);
  const routes = ["free", "sp", "cs"].map((color) => {
    const link = $(`.route-link.${color}`);
    return { color, port: $(".route-port", link), badge: $(`#${link.dataset.goto} .layer-num`) };
  });
  function drawRoutes() {
    if (!rails.getClientRects().length) return;
    const origin = main.getBoundingClientRect();
    let width = 0, height = 0;
    const tracks = routes.map(({ color, port, badge }) => {
      const a = port.getBoundingClientRect(), b = badge.getBoundingClientRect();
      const x = a.left + a.width / 2 - origin.left, y1 = a.bottom - origin.top;
      const x2 = b.left - origin.left, y2 = b.top + b.height / 2 - origin.top;
      const radius = 10;
      width = Math.max(width, x2); height = Math.max(height, y2);
      return `<path class="rail ${color}" d="M${x} ${y1} V${y2 - radius} Q${x} ${y2} ${x + radius} ${y2} H${x2}"/>`;
    });
    rails.setAttribute("width", Math.ceil(width) + 2);
    rails.setAttribute("height", Math.ceil(height) + 2);
    rails.innerHTML = tracks.join("");
  }
  const layout = new ResizeObserver(drawRoutes);
  $$("main > .slide, #headline").forEach((el) => layout.observe(el));
  window.addEventListener("resize", drawRoutes);
  document.fonts.ready.then(drawRoutes);
  drawRoutes();

  /* ---------- Elements ---------- */
  const detail = $("#detail");
  const qrDialog = $("#qr-dialog");
  const tiles = $$(".tile[id]");
  const slides = $$("[data-slide]");
  const bar = $(".present-bar");
  const slideCount = $("[data-slide-count]");
  const slidePrev = $("[data-slide-prev]");
  const slideNext = $("[data-slide-next]");
  const D = {
    icon: $("[data-d-icon]", detail),
    section: $("[data-d-section]", detail),
    title: $("[data-d-title]", detail),
    sub: $("[data-d-sub]", detail),
    body: $("[data-d-body]", detail),
    prev: $("[data-d-prev]", detail),
    next: $("[data-d-next]", detail),
    prevName: $("[data-d-prev-name]", detail),
    nextName: $("[data-d-next-name]", detail),
    count: $("[data-d-count]", detail),
  };

  const isPresenting = () => html.classList.contains("present");
  const slideOf = (el) => el.closest("[data-slide]");
  const tileName = (tile) => $(".tile-open", tile).textContent.trim();
  // In presentation mode, prev/next stay within the section on screen.
  const scopeOf = (tile) => (isPresenting() ? $$(".tile[id]", slideOf(tile)) : tiles);

  function sectionLabel(tile) {
    const slide = slideOf(tile);
    const num = $(".layer-num", slide);
    const h = $(".layer-title h2", slide);
    return [num && num.textContent.trim(), h && h.textContent.trim()].filter(Boolean).join(" · ");
  }

  /* ---------- Tile detail dialog ---------- */
  let currentTile = null;

  function openDetail(tile) {
    if (!tile) return;
    currentTile = tile;
    if (isPresenting()) {
      const i = slides.indexOf(slideOf(tile));
      if (i !== slideIdx) showSlide(i);
    }

    detail.dataset.plan = tile.dataset.plan || "";
    D.icon.innerHTML = $(".tile-icon", tile).innerHTML;
    D.section.textContent = sectionLabel(tile);
    D.title.textContent = tileName(tile);
    const sub = $(".tile-sub", tile);
    D.sub.textContent = sub ? sub.textContent.trim() : "";
    const pill = $(".tile-top .pill", tile);
    if (pill) D.sub.append(" ", pill.cloneNode(true));
    D.body.innerHTML = $(".tile-detail", tile).innerHTML;
    $$('a[href^="http"]', D.body).forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });

    const scope = scopeOf(tile);
    const i = scope.indexOf(tile);
    const prev = scope[i - 1];
    const next = scope[i + 1];
    D.prev.disabled = !prev;
    D.next.disabled = !next;
    D.prevName.textContent = prev ? tileName(prev) : "Previous";
    D.nextName.textContent = next ? tileName(next) : "Next";
    D.prev.setAttribute("aria-label", prev ? `Previous: ${tileName(prev)}` : "Previous");
    D.next.setAttribute("aria-label", next ? `Next: ${tileName(next)}` : "Next");
    D.count.textContent = `${i + 1} / ${scope.length}`;
    D.body.parentElement.scrollTop = 0;

    if (!detail.open) detail.showModal();
    if (document.activeElement === D.next && D.next.disabled) D.prev.focus();
    if (document.activeElement === D.prev && D.prev.disabled) D.next.focus();
    history.replaceState(null, "", `#${tile.id}`);
  }

  function stepDetail(dir) {
    if (!currentTile) return;
    const scope = scopeOf(currentTile);
    const target = scope[scope.indexOf(currentTile) + dir];
    if (target) openDetail(target);
  }

  detail.addEventListener("close", () => {
    history.replaceState(null, "", location.pathname + location.search);
    const tile = currentTile;
    currentTile = null;
    if (tile) $(".tile-open", tile).focus();
  });

  // Close on backdrop click (only when the press also started on the backdrop).
  [detail, qrDialog].forEach((dlg) => {
    let pressedBackdrop = false;
    dlg.addEventListener("pointerdown", (e) => { pressedBackdrop = e.target === dlg; });
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg && pressedBackdrop) dlg.close();
      pressedBackdrop = false;
    });
  });

  /* ---------- QR dialog ---------- */
  function openQr() {
    if (detail.open || qrDialog.open) return;
    qrDialog.showModal();
  }

  const copyBtn = $("[data-copy-link]");
  if (copyBtn) {
    const label = $("span", copyBtn);
    let timer;
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(BASE);
        label.textContent = "Link copied";
      } catch (e) {
        label.textContent = "Copy failed";
      }
      clearTimeout(timer);
      timer = setTimeout(() => { label.textContent = "Copy link"; }, 1800);
    });
  }

  /* ---------- Presentation mode ---------- */
  let slideIdx = 0;
  let ownsFullscreen = false;
  let returnTo = null;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  function showSlide(i) {
    slideIdx = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => s.classList.toggle("is-current", k === slideIdx));
    slides[slideIdx].scrollTop = 0;
    slideCount.textContent = `${slideIdx + 1} / ${slides.length}`;
    slidePrev.disabled = slideIdx === 0;
    slideNext.disabled = slideIdx === slides.length - 1;
  }

  async function enterPresent(index) {
    if (index < 0) index = 0;
    if (isPresenting()) { showSlide(index); return; }
    html.classList.add("present");
    bar.hidden = false;
    showSlide(index);

    const request = html.requestFullscreen || html.webkitRequestFullscreen;
    if (request && !fullscreenElement()) {
      try {
        await request.call(html, { navigationUI: "hide" });
        ownsFullscreen = true;
        // Chromium: let a single Esc close dialogs instead of leaving full screen.
        if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(["Escape"]).catch(() => {});
      } catch (e) { /* full screen refused: present in the window */ }
    }
  }

  function scrollToSlide(slide) {
    if (slide) slide.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function exitPresent() {
    if (!isPresenting()) return;
    const current = slides[slideIdx].id === "scan-to-follow" ? $("#top") : slides[slideIdx];
    html.classList.remove("present");
    bar.hidden = true;
    slides.forEach((s) => s.classList.remove("is-current"));
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    if (ownsFullscreen && fullscreenElement()) {
      returnTo = current;
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      const result = exit.call(document);
      if (result && result.catch) result.catch(() => {});
    }
    ownsFullscreen = false;
    scrollToSlide(current);
  }

  function onFullscreenChange() {
    if (fullscreenElement()) return;
    if (ownsFullscreen) {
      ownsFullscreen = false;
      exitPresent();
    }
    if (returnTo) {
      scrollToSlide(returnTo);
      returnTo = null;
    }
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);

  /* ---------- Clicks ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest(
      ".tile-open, [data-theme-toggle], [data-qr], [data-present], [data-present-at], [data-present-exit], " +
      "[data-slide-prev], [data-slide-next], [data-d-prev], [data-d-next], [data-close], [data-goto]"
    );
    if (!el) return;
    if (el.matches(".tile-open")) openDetail(el.closest(".tile"));
    else if (el.matches("[data-theme-toggle]")) toggleTheme();
    else if (el.matches("[data-qr]")) openQr();
    else if (el.matches("[data-present-at]")) enterPresent(slides.findIndex((s) => s.id === el.dataset.presentAt));
    else if (el.matches("[data-present]")) enterPresent(0);
    else if (el.matches("[data-present-exit]")) exitPresent();
    else if (el.matches("[data-slide-prev]")) showSlide(slideIdx - 1);
    else if (el.matches("[data-slide-next]")) showSlide(slideIdx + 1);
    else if (el.matches("[data-d-prev]")) stepDetail(-1);
    else if (el.matches("[data-d-next]")) stepDetail(1);
    else if (el.matches("[data-close]")) el.closest("dialog").close();
    else if (el.matches("[data-goto]") && isPresenting()) {
      e.preventDefault();
      showSlide(slides.findIndex((s) => s.id === el.dataset.goto));
    }
  });

  /* ---------- Keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const onControl = e.target instanceof Element && e.target.closest("button, a, input, textarea, select");

    if (k === "t" || k === "T") { toggleTheme(); return; }

    // Dialogs handle Esc natively; arrows walk through tiles.
    if (detail.open) {
      if (k === "ArrowRight") { e.preventDefault(); stepDetail(1); }
      else if (k === "ArrowLeft") { e.preventDefault(); stepDetail(-1); }
      return;
    }
    if (qrDialog.open) return;

    if (k === "p" || k === "P") {
      e.preventDefault();
      if (isPresenting()) exitPresent();
      else enterPresent(0);
      return;
    }
    if (k === "q" || k === "Q") { openQr(); return; }
    if (!isPresenting()) return;

    if (k === "Escape") { e.preventDefault(); exitPresent(); }
    else if (k === "ArrowRight" || k === "PageDown" || (k === " " && !e.shiftKey && !onControl)) { e.preventDefault(); showSlide(slideIdx + 1); }
    else if (k === "ArrowLeft" || k === "PageUp" || (k === " " && e.shiftKey && !onControl)) { e.preventDefault(); showSlide(slideIdx - 1); }
    else if (k === "Home") { e.preventDefault(); showSlide(0); }
    else if (k === "End") { e.preventDefault(); showSlide(slides.length - 1); }
  });

  /* ---------- Swipe between slides on touch screens ---------- */
  let touchX = null;
  let touchY = null;
  document.addEventListener("touchstart", (e) => {
    if (!isPresenting() || detail.open || qrDialog.open || e.touches.length !== 1) { touchX = null; return; }
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) showSlide(slideIdx + (dx < 0 ? 1 : -1));
  }, { passive: true });

  /* ---------- Deep links: #tile-id opens its details ---------- */
  function openFromHash() {
    let id = "";
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
    if (!id) return;
    const tile = document.getElementById(id);
    if (tile && tile.matches(".tile[id]") && currentTile !== tile) openDetail(tile);
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
})();
