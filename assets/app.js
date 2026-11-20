/* GHAS Panorama: theme, QR codes, tile details and presentation mode. No dependencies besides qrcode.js. */
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

  function visibleSlideIndex() {
    const line = window.innerHeight * 0.35;
    let idx = 0;
    slides.forEach((s, k) => { if (s.getBoundingClientRect().top <= line) idx = k; });
    return idx;
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
    const current = slides[slideIdx];
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
      else enterPresent(visibleSlideIndex());
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
