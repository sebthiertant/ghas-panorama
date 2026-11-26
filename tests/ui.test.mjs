import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { launchBrowser } from "./browser.mjs";

let browser;
const artifacts = new URL("../.artifacts/", import.meta.url);
before(async () => {
  await mkdir(artifacts, { recursive: true });
  browser = await launchBrowser();
});
after(async () => {
  if (!browser) return;
  try {
    assert.deepEqual(browser.errors, [], "No JavaScript exceptions or failed resource requests");
  } finally {
    await browser.close();
  }
});

async function screenshot(name) {
  const { data } = await browser.command("Page.captureScreenshot", { captureBeyondViewport: false });
  await writeFile(new URL(`${name}.png`, artifacts), Buffer.from(data, "base64"));
}

test("all feature dialogs render their own content and public sources", async () => {
  await browser.navigate();
  const tiles = await browser.evaluate(`Array.from(document.querySelectorAll(".tile[id]"), tile => ({
    id: tile.id, title: tile.querySelector(".tile-open").textContent.trim()
  }))`);
  assert.ok(tiles.length > 0);
  for (const tile of tiles) {
    await browser.click(`#${tile.id} .tile-open`);
    await browser.waitFor("document.querySelector('#detail').open");
    assert.equal(await browser.evaluate("document.querySelector('[data-d-title]').textContent"), tile.title);
    assert.equal(await browser.evaluate("location.hash"), `#${tile.id}`);
    const links = await browser.evaluate(`Array.from(document.querySelectorAll("#detail .d-links a"), a => ({
      href: a.href, target: a.target, rel: a.rel
    }))`);
    assert.ok(links.length > 0, `${tile.id} needs public sources`);
    for (const link of links) {
      assert.match(link.href, /^https:\/\//);
      assert.equal(link.target, "_blank");
      assert.match(link.rel, /\bnoopener\b/);
      assert.match(link.rel, /\bnoreferrer\b/);
    }
    await browser.key("Escape", "Escape", 27);
    await browser.waitFor("!document.querySelector('#detail').open && location.hash === ''");
    assert.equal(await browser.evaluate("document.activeElement.closest('.tile')?.id"), tile.id);
  }
  const links = await browser.evaluate(`Array.from(new Set(
    Array.from(document.querySelectorAll("a[href]"), a => a.href).filter(href => href.startsWith("https://"))
  )).sort()`);
  await writeFile(new URL("source-links.json", artifacts), JSON.stringify(links, null, 2) + "\n");
});

test("deep links, dialog navigation, and the QR dialog work", async () => {
  await browser.navigate("#dependabot");
  await browser.waitFor("document.querySelector('#detail').open");
  const first = await browser.evaluate("document.querySelector('[data-d-title]').textContent");
  await browser.key("ArrowRight", "ArrowRight", 39);
  assert.notEqual(await browser.evaluate("document.querySelector('[data-d-title]').textContent"), first);
  await browser.key("ArrowLeft", "ArrowLeft", 37);
  assert.equal(await browser.evaluate("document.querySelector('[data-d-title]').textContent"), first);
  await screenshot("feature-dialog");
  await browser.key("Escape", "Escape", 27);
  await browser.waitFor("!document.querySelector('#detail').open");
  await browser.click("[data-qr]");
  assert.ok(await browser.evaluate("document.querySelector('#qr-dialog').open"));
  assert.ok(await browser.evaluate("document.querySelector('#qr-dialog .qr svg path').getAttribute('d').length > 100"));
  assert.equal(
    await browser.evaluate("document.querySelector('#qr-dialog [data-qr-url]').textContent"),
    "sebthiertant.github.io/ghas-panorama",
  );
  await screenshot("qr-dialog");
  await browser.key("Escape", "Escape", 27);
});

test("theme controls persist the selected theme across reloads", async () => {
  await browser.navigate();
  assert.equal(await browser.evaluate("document.documentElement.dataset.theme"), "dark");
  await browser.click("[data-theme-toggle]");
  assert.equal(await browser.evaluate("document.documentElement.dataset.theme"), "light");
  await browser.navigate();
  assert.equal(await browser.evaluate("document.documentElement.dataset.theme"), "light");
  await browser.key("t", "KeyT", 84);
  assert.equal(await browser.evaluate("document.documentElement.dataset.theme"), "dark");
});

test("desktop, tablet, and mobile layouts fit in both themes", async () => {
  for (const [label, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["mobile", 390, 844], ["narrow", 320, 740]]) {
    await browser.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await browser.navigate();
    for (const theme of ["dark", "light"]) {
      await browser.waitFor(`document.documentElement.dataset.theme === "${theme}"`);
      assert.ok(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `${label}/${theme}: horizontal overflow`);
      const clipped = await browser.evaluate(`Array.from(document.querySelectorAll(".tile, .product, .topbar .actions button"))
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width && (rect.left < -1 || rect.right > innerWidth + 1);
        }).map(element => element.id || element.className)`);
      assert.deepEqual(clipped, [], `${label}/${theme}: controls or cards off screen`);
      await browser.evaluate("scrollTo({ top: 0, behavior: 'instant' })");
      await screenshot(`${label}-${theme}`);
      if (theme === "dark") await browser.key("t", "KeyT", 84);
    }
    await browser.key("t", "KeyT", 84);
  }
});

test("presentation navigation, section-scoped dialogs, and exit work", async () => {
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.navigate();
  await browser.click("[data-present]");
  await browser.waitFor("document.documentElement.classList.contains('present')");
  assert.equal(await browser.evaluate("document.querySelector('.slide.is-current').id"), "scan-to-follow");
  await browser.key("ArrowRight", "ArrowRight", 39);
  assert.equal(await browser.evaluate("document.querySelector('.slide.is-current').id"), "top");
  await browser.click("[data-goto='code-security']");
  assert.equal(await browser.evaluate("document.querySelector('.slide.is-current').id"), "code-security");
  const first = await browser.evaluate("document.querySelector('#code-security .tile').id");
  await browser.click(`#${first} .tile-open`);
  assert.ok(await browser.evaluate("document.querySelector('[data-d-prev]').disabled"));
  await browser.click("#detail [data-close]");
  await browser.waitFor("!document.querySelector('#detail').open && location.hash === ''");
  await browser.key("End", "End", 35);
  assert.ok(await browser.evaluate("document.querySelector('[data-slide-next]').disabled"));
  await browser.key("Home", "Home", 36);
  assert.ok(await browser.evaluate("document.querySelector('[data-slide-prev]').disabled"));
  const count = await browser.evaluate("document.querySelectorAll('[data-slide]').length");
  for (let index = 0; index < count; index++) {
    assert.equal(await browser.evaluate("document.querySelectorAll('.slide.is-current').length"), 1);
    assert.equal(await browser.evaluate("document.querySelector('[data-slide-count]').textContent"), `${index + 1} / ${count}`);
    assert.ok(await browser.evaluate("document.querySelector('.slide.is-current').scrollWidth <= innerWidth + 1"));
    await screenshot(`slide-${index + 1}`);
    if (index < count - 1) await browser.key("ArrowRight", "ArrowRight", 39);
  }
  await browser.click("[data-present-exit]");
  await browser.waitFor("!document.documentElement.classList.contains('present') && !document.fullscreenElement");
  await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.ok(await browser.evaluate("document.querySelector('.present-bar').hidden"));
  await browser.click("[data-present-at='secret-protection']");
  await browser.waitFor("document.querySelector('.slide.is-current')?.id === 'secret-protection'");
  assert.equal(await browser.evaluate("document.querySelector('.slide.is-current').id"), "secret-protection");
  await browser.key("p", "KeyP", 80);
  assert.ok(await browser.evaluate("!document.documentElement.classList.contains('present')"));
});
