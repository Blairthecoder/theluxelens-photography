// Focused QA for portfolio filters, gallery viewer and mobile booking bar.
// Run: NODE_PATH=$(npm root -g) node qa/mobile-portfolio.mjs
// Needs Playwright + Chromium (PLAYWRIGHT_BROWSERS_PATH is honoured). No repo dependencies.
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` ${detail}`}`);
};

const browser = await chromium.launch();
const errors = [];
async function open(url, viewport, options = {}) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width <= 760, ...options });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${url}: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(`${url}: ${message.text()}`); });
  await page.goto(base + url, { waitUntil: "load" });
  return page;
}
const scrollTo = async (page, y) => { await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y); await page.waitForTimeout(350); };
const barVisible = (page) => page.evaluate(() => { const b = document.querySelector("[data-booking-bar]"); return !!b && getComputedStyle(b).visibility === "visible" && getComputedStyle(b).display !== "none"; });

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  const tag = `${viewport.width}x${viewport.height}`;
  const page = await open("/portfolio/", viewport);

  // Filters: one scrollable row, 44px targets, pressed state, counts
  const layout = await page.evaluate(() => {
    const c = document.querySelector("[data-portfolio-controls]");
    const tops = new Set([...c.children].map((b) => Math.round(b.getBoundingClientRect().top)));
    return { rows: tops.size, scrolls: c.scrollWidth > c.clientWidth, minHeight: Math.min(...[...c.children].map((b) => b.getBoundingClientRect().height)), pageOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  check(`${tag} filters in one row`, layout.rows === 1, JSON.stringify(layout));
  check(`${tag} filter row scrolls inside itself`, layout.scrolls && !layout.pageOverflow, JSON.stringify(layout));
  check(`${tag} filter targets >= 44px`, layout.minHeight >= 44, String(layout.minHeight));
  check(`${tag} initial count`, (await page.textContent("[data-portfolio-count]")) === "18 portfolio stories shown.");

  for (const filter of ["wedding", "events", "studio", "lifestyle", "maternity", "all"]) {
    await page.focus(`[data-filter="${filter}"]`);
    await page.keyboard.press("Enter");
    const state = await page.evaluate((f) => ({
      pressed: [...document.querySelectorAll("[data-filter]")].map((b) => b.getAttribute("aria-pressed")),
      shown: [...document.querySelectorAll("[data-category]")].filter((i) => !i.hidden).length,
      focusedFilter: document.activeElement?.dataset.filter,
      count: document.querySelector("[data-portfolio-count]").textContent,
      hiddenFocusable: [...document.querySelectorAll("[data-category][hidden] button")].some((b) => b.offsetParent !== null),
    }), filter);
    const onlyOne = state.pressed.filter((v) => v === "true").length === 1;
    const expectedWord = state.shown === 1 ? "story" : "stories";
    check(`${tag} filter ${filter}: pressed state, count, focus kept, hidden cards out of tab order`,
      onlyOne && state.pressed[["all", "wedding", "events", "studio", "lifestyle", "maternity"].indexOf(filter)] === "true" &&
      state.count === `${state.shown} portfolio ${expectedWord} shown.` && state.focusedFilter === filter && !state.hiddenFocusable, JSON.stringify(state));
  }

  // Viewer: dialog semantics, focus trap, focus return, swipe
  const trigger = page.locator('[data-story-open="vince-young-netflix-premiere"]');
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = await page.evaluate(() => {
    const d = document.querySelector(".portfolio-viewer__dialog");
    return { role: d.getAttribute("role"), modal: d.getAttribute("aria-modal"), label: document.getElementById(d.getAttribute("aria-labelledby"))?.textContent, desc: document.getElementById(d.getAttribute("aria-describedby"))?.textContent, focusInside: d.contains(document.activeElement), locked: getComputedStyle(document.body).overflow === "hidden" };
  });
  check(`${tag} viewer is a labelled modal dialog with focus inside and scroll locked`, dialog.role === "dialog" && dialog.modal === "true" && dialog.label && /1 of 22/.test(dialog.desc) && dialog.focusInside && dialog.locked, JSON.stringify(dialog));
  check(`${tag} viewer hint shown for multi-image story`, await page.locator("[data-viewer-hint]").isVisible());
  check(`${tag} booking bar hidden while viewer open`, !(await barVisible(page)));

  const inDialog = () => page.evaluate(() => document.querySelector(".portfolio-viewer__dialog").contains(document.activeElement));
  let trapped = true;
  for (let i = 0; i < 6; i += 1) { await page.keyboard.press("Tab"); trapped &&= await inDialog(); }
  for (let i = 0; i < 6; i += 1) { await page.keyboard.press("Shift+Tab"); trapped &&= await inDialog(); }
  check(`${tag} Tab / Shift+Tab stay inside viewer`, trapped);
  const cycle = new Set();
  for (let i = 0; i < 5; i += 1) { await page.keyboard.press("Tab"); cycle.add(await page.evaluate(() => document.activeElement.textContent.trim())); }
  check(`${tag} focus cycle includes Close, Previous, Next`, ["Close", "Previous", "Next"].every((l) => cycle.has(l)), [...cycle].join("|"));

  const status = () => page.textContent("[data-viewer-status]");
  const swipe = async (dx, dy) => {
    const box = await page.locator(".portfolio-viewer__figure img").boundingBox();
    const cx = box.x + box.width / 2; const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const point = (x, y) => [{ x, y }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(cx, cy) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(cx + dx / 2, cy + dy / 2) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(cx + dx, cy + dy) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(150);
  };
  const before = await status();
  await swipe(-5, 0);
  check(`${tag} tap does not change image`, (await status()) === before);
  await swipe(-90, 10);
  check(`${tag} swipe left advances`, (await status()) === "2 of 22", await status());
  await swipe(90, -10);
  check(`${tag} swipe right returns`, (await status()) === "1 of 22", await status());
  await swipe(10, -120);
  check(`${tag} vertical gesture ignored`, (await status()) === "1 of 22", await status());

  await page.keyboard.press("Escape");
  check(`${tag} Escape closes viewer and returns focus to launching card`, await page.evaluate(() => document.querySelector("[data-portfolio-viewer]").hidden && document.activeElement?.dataset.storyOpen === "vince-young-netflix-premiere"));
  await page.keyboard.press("Escape");
  check(`${tag} double close is harmless`, await page.evaluate(() => document.querySelector("[data-portfolio-viewer]").hidden));

  // Booking bar on portfolio
  await scrollTo(page, 0);
  check(`${tag} booking bar hidden on load`, !(await barVisible(page)));
  const introBottom = await page.evaluate(() => document.querySelector("main > section").getBoundingClientRect().bottom + scrollY);
  await scrollTo(page, introBottom + 400);
  check(`${tag} booking bar shows after intro`, await barVisible(page));
  const barLabel = await page.evaluate(() => { const b = document.querySelector("[data-booking-bar]"); return { links: b.querySelectorAll("a").length, text: b.textContent.trim(), href: b.querySelector("a").href, header: document.querySelector(".nav-book").href, bars: document.querySelectorAll("[data-booking-bar]").length }; });
  check(`${tag} single "Check Availability" button reusing site booking URL, one bar`, barLabel.links === 1 && barLabel.text === "Check Availability" && barLabel.href === barLabel.header && barLabel.bars === 1, JSON.stringify(barLabel));
  await page.click("[data-menu-toggle]");
  check(`${tag} booking bar hidden while mobile nav open`, !(await barVisible(page)));
  await page.click("[data-menu-toggle]");
  await scrollTo(page, await page.evaluate(() => document.body.scrollHeight));
  check(`${tag} booking bar hidden at CTA/footer`, !(await barVisible(page)));
  check(`${tag} no horizontal page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.context().close();
}

// Sticky filters must not cover the first row at rest, and stop before the CTA
{
  const page = await open("/portfolio/", { width: 390, height: 844 });
  const pos = await page.evaluate(() => {
    const f = document.querySelector("[data-portfolio-filter]"); const g = document.querySelector(".portfolio-story-grid");
    return { filterBottom: f.getBoundingClientRect().bottom, gridTop: g.getBoundingClientRect().top };
  });
  check("390 filter row does not overlap first row at rest", pos.filterBottom <= pos.gridTop + 1, JSON.stringify(pos));
  const y = await page.evaluate(() => document.querySelector(".cta-panel").getBoundingClientRect().top + scrollY - 300);
  await scrollTo(page, y);
  const stop = await page.evaluate(() => ({ f: document.querySelector("[data-portfolio-filter]").getBoundingClientRect().bottom, cta: document.querySelector(".cta-panel").getBoundingClientRect().top }));
  check("390 sticky filters end before final CTA", stop.f <= stop.cta, JSON.stringify(stop));
  await page.context().close();
}

// Eligible / excluded booking-bar pages
const eligible = ["/", "/portfolio/", "/services/", "/services/wedding-photography-houston/", "/services/commercial-photography-houston/"];
const excluded = ["/contact/", "/thank-you/", "/privacy/", "/terms/", "/journal/", "/newsletter/", "/404.html", "/about/", "/events/", "/portfolio/vince-young-netflix-premiere/"];
const articles = fs.readdirSync(path.join(root, "journal"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/journal/${d.name}/`).slice(0, 2);
for (const url of eligible) {
  const page = await open(url, { width: 390, height: 844 });
  check(`eligible ${url}: bar hidden at load`, !(await barVisible(page)));
  await scrollTo(page, 1400);
  const visible = await barVisible(page);
  const total = await page.evaluate(() => document.body.scrollHeight);
  check(`eligible ${url}: bar appears after intro`, visible || total < 2400);
  await page.context().close();
}
for (const url of [...excluded, ...articles]) {
  const page = await open(url, { width: 390, height: 844 });
  await scrollTo(page, 1400);
  check(`excluded ${url}: no bar`, (await page.locator("[data-booking-bar]").count()) === 0);
  await page.context().close();
}
{
  const page = await open("/portfolio/", { width: 390, height: 844 }, { javaScriptEnabled: false });
  check("no-JS portfolio: no bar, filters hidden, stories visible", await page.evaluate(() => !document.querySelector("[data-booking-bar]") && getComputedStyle(document.querySelector("[data-portfolio-filter]")).display === "none" && [...document.querySelectorAll("[data-story-open]")].every((b) => b.offsetParent !== null)));
  await page.context().close();
}

// Desktop / tablet breakpoints
for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  const tag = `${viewport.width}x${viewport.height}`;
  const page = await open("/portfolio/", viewport);
  await scrollTo(page, 1600);
  const state = await page.evaluate(() => { const c = document.querySelector("[data-portfolio-controls]"); const b = document.querySelector("[data-booking-bar]"); return { wraps: getComputedStyle(c).flexWrap, bar: b ? getComputedStyle(b).display : "none", overflow: document.documentElement.scrollWidth > innerWidth }; });
  check(`${tag} desktop filter layout kept, bar not displayed, no overflow`, state.wraps === "wrap" && state.bar === "none" && !state.overflow, JSON.stringify(state));
  await page.click('[data-filter="studio"]');
  await page.click('[data-story-open="editorial-studio"]');
  check(`${tag} mouse open viewer`, await page.evaluate(() => !document.querySelector("[data-portfolio-viewer]").hidden));
  await page.click(".portfolio-viewer__dialog .portfolio-viewer__figure");
  check(`${tag} click inside dialog does not close`, await page.evaluate(() => !document.querySelector("[data-portfolio-viewer]").hidden));
  await page.keyboard.press("Escape");
  await page.context().close();
}

// Reduced motion
{
  const page = await open("/portfolio/", { width: 390, height: 844 }, { reducedMotion: "reduce" });
  await scrollTo(page, 1500);
  const t = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("[data-booking-bar]")).transitionDuration) * 1000);
  check("reduced motion: booking bar has no transition", t <= 1, String(t));
  await page.context().close();
}

check("no console/page errors", errors.length === 0, errors.join("\n"));
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
