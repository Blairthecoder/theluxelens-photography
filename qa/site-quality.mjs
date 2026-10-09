// Site-wide QA: static link/asset/heading checks, page-level overflow, navigation a11y and contact-form disclosure.
// Complements qa/mobile-portfolio.mjs (portfolio filters, gallery viewer, booking bar).
// Run: NODE_PATH=$(npm root -g) node qa/site-quality.mjs
// Static checks read the repository files only; browser checks need Playwright + Chromium. No repo dependencies.
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` ${detail}`}`);
};

// ---------- Static checks (no browser) ----------
const htmlFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "qa") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".html")) htmlFiles.push(full);
  }
})(root);
const pageUrl = (file) => "/" + path.relative(root, file).replace(/index\.html$/, "");
const pages = htmlFiles.filter((file) => !/^[0-9a-f-]{36}\.html$/.test(path.basename(file)));
const sources = new Map(pages.map((file) => [file, fs.readFileSync(file, "utf8")]));
// Elements that only exist for script (templates, JSON data) must not be read as page markup.
const markup = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "");

function resolveLocal(from, ref) {
  const clean = ref.split("#")[0].split("?")[0];
  if (!clean) return from;
  const target = path.join(root, clean.startsWith("/") ? clean : path.join(path.dirname(from), clean));
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) return fs.existsSync(path.join(target, "index.html")) ? path.join(target, "index.html") : null;
  return fs.existsSync(target) ? target : null;
}

const brokenLinks = [];
const brokenAssets = [];
const headingProblems = [];
for (const [file, html] of sources) {
  const body = markup(html);
  const label = pageUrl(file);
  for (const match of body.matchAll(/<a\b[^>]*?\shref="([^"]*)"/gi)) {
    const href = match[1];
    if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(href) || href === "") continue;
    const target = resolveLocal(file, href);
    if (!target) { brokenLinks.push(`${label} -> ${href}`); continue; }
    const hash = href.split("#")[1];
    if (hash && target.endsWith(".html") && !new RegExp(`\\sid="${hash}"`).test(sources.get(target) ?? fs.readFileSync(target, "utf8"))) brokenLinks.push(`${label} -> ${href} (missing anchor)`);
  }
  const refs = [];
  for (const match of html.matchAll(/<(img|source|script|link)\b([^>]*)>/gi)) {
    const attrs = match[2];
    const single = attrs.match(/\s(?:src|href)="([^"]+)"/);
    if (single && !(match[1].toLowerCase() === "link" && !/rel="(?:icon|stylesheet|preload)"/.test(attrs))) refs.push(single[1]);
    for (const set of attrs.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/g)) set[1].split(",").forEach((item) => refs.push(item.trim().split(/\s+/)[0]));
  }
  for (const ref of refs) {
    if (/^(https?:|data:|\/\/)/i.test(ref)) continue;
    if (!resolveLocal(file, ref)) brokenAssets.push(`${label} -> ${ref}`);
  }
  // Headings: exactly one h1 and no skipped levels in source order.
  const levels = [...body.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  if (levels.filter((l) => l === 1).length !== 1) headingProblems.push(`${label}: ${levels.filter((l) => l === 1).length} h1 elements`);
  levels.forEach((level, index) => { if (index && level > levels[index - 1] + 1) headingProblems.push(`${label}: h${levels[index - 1]} -> h${level}`); });
}
check(`static: ${pages.length} pages scanned`, pages.length >= 35);
check("static: internal links resolve to generated pages and anchors", brokenLinks.length === 0, `\n  ${brokenLinks.slice(0, 15).join("\n  ")}`);
check("static: local images, srcsets, scripts and stylesheets exist", brokenAssets.length === 0, `\n  ${brokenAssets.slice(0, 15).join("\n  ")}`);
check("static: one h1 per page, no skipped heading levels", headingProblems.length === 0, `\n  ${headingProblems.slice(0, 15).join("\n  ")}`);

// Netlify form markup stays intact
{
  const contact = sources.get(path.join(root, "contact/index.html"));
  const form = contact.match(/<form\b[^>]*id="inquiry-form"[^>]*>/)?.[0] ?? "";
  const names = [...contact.matchAll(/<(?:input|select|textarea)\b[^>]*\sname="([^"]+)"/g)].map((m) => m[1]);
  const expected = ["form-name", "bot-field", "name", "email", "phone", "service", "preferred-date", "location", "business-name", "industry", "team-size", "required-delivery-date", "intended-image-use", "message", "privacy-consent"];
  check("static: contact form keeps Netlify attributes, thank-you action and field names",
    /name="photography-inquiry"/.test(form) && /data-netlify="true"/.test(form) && /netlify-honeypot="bot-field"/.test(form) && /action="\/thank-you\/"/.test(form) && /method="POST"/.test(form) &&
    expected.every((n) => names.includes(n)) && names.length === expected.length, `${names.join(",")}`);
  const labels = [...contact.matchAll(/<(?:input|select|textarea)\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]).filter((id) => !/^(bot)/.test(id));
  check("static: every contact control has a matching label", labels.every((id) => new RegExp(`<label[^>]*for="${id}"`).test(contact)), labels.join(","));
}

// ---------- Browser checks ----------
const { chromium } = createRequire(import.meta.url)("playwright");
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
const errors = [];
async function open(url, viewport, options = {}) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width <= 760, ...options });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${url}: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${url}: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${url}: ${response.status()} ${response.url()}`); });
  await page.goto(base + url, { waitUntil: "load" });
  return page;
}

// Page-level horizontal overflow. html/body use overflow-x: clip, so scrollWidth alone can hide a real overflow:
// look for painted elements that extend past the viewport without a clipping ancestor, and for body scroll width.
const viewports = [[320, 568], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
const overflowPages = pages.map(pageUrl).filter((url) => !/^\/(terms|journal\/[^/]+)\/$/.test(url) || url === "/terms/" || url === "/journal/houston-wedding-photography-timeline/");
const overflowIssues = [];
for (const [width, height] of viewports) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width <= 760 });
  for (const url of overflowPages) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${url}: ${error.message}`));
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${url}: ${response.status()} ${response.url()}`); });
    await page.goto(base + url, { waitUntil: "load" });
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) { scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 25)); }
      scrollTo({ top: 0, behavior: "instant" });
    });
    const found = await page.evaluate(() => {
      const vw = innerWidth;
      const contained = (el) => {
        for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== "visible") { const r = p.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return true; }
        }
        return false;
      };
      const out = [];
      if (document.body.scrollWidth > vw || document.documentElement.scrollWidth > vw) out.push(`scrollWidth body=${document.body.scrollWidth} html=${document.documentElement.scrollWidth}`);
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest("svg, [hidden], .mobile-nav, .visually-hidden")) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.position === "fixed") continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height && (r.right > vw + 1 || r.left < -1) && !contained(el)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return out.slice(0, 3);
    });
    if (found.length) overflowIssues.push(`${width}px ${url}: ${found.join("; ")}`);
    await page.close();
  }
  await context.close();
}
check(`overflow: no page-level horizontal overflow on ${overflowPages.length} pages at ${viewports.map((v) => v.join("x")).join(", ")}`, overflowIssues.length === 0, `\n  ${overflowIssues.slice(0, 20).join("\n  ")}`);

// Current-page state in both navs
for (const [url, label] of [["/", "Home"], ["/portfolio/", "Portfolio"], ["/services/", "Services"], ["/services/wedding-photography-houston/", "Services"], ["/journal/", "Journal"], ["/journal/houston-wedding-photography-timeline/", "Journal"], ["/events/", "Events"], ["/about/", "About"], ["/contact/", "Contact"]]) {
  const page = await open(url, { width: 1440, height: 900 });
  const current = await page.evaluate(() => ({ d: [...document.querySelectorAll(".desktop-nav [aria-current='page']")].map((a) => a.textContent.trim()), m: [...document.querySelectorAll(".mobile-nav [aria-current='page']")].map((a) => a.textContent.trim()) }));
  const underline = await page.evaluate(() => { const a = document.querySelector(".desktop-nav [aria-current='page']"); return a ? getComputedStyle(a, "::after").transform : "none"; });
  check(`nav current page ${url}: exactly "${label}" in desktop and mobile nav, visible indicator`, current.d.length === 1 && current.d[0] === label && current.m.length === 1 && current.m[0] === label && underline !== "none" && !/matrix\(0,/.test(underline), JSON.stringify({ current, underline }));
  await page.context().close();
}

// Desktop nav between the mobile breakpoint (1040px) and full width: no collisions, single row
for (const width of [1041, 1100, 1280]) {
  const page = await open("/contact/", { width, height: 800 });
  const state = await page.evaluate(() => {
    const brand = document.querySelector(".brand").getBoundingClientRect();
    const links = [...document.querySelector(".desktop-nav").children].map((a) => a.getBoundingClientRect());
    const book = document.querySelector(".nav-book").getBoundingClientRect();
    return { rows: new Set(links.map((l) => Math.round(l.top))).size, gapLeft: links[0].left - brand.right, gapRight: book.left - links.at(-1).right, burger: getComputedStyle(document.querySelector("[data-menu-toggle]")).display };
  });
  check(`${width}px desktop nav: one row, no collision with brand or Book button, menu button hidden`, state.rows === 1 && state.gapLeft >= 16 && state.gapRight >= 16 && state.burger === "none", JSON.stringify(state));
  await page.focus(".desktop-nav a:nth-child(2)");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
  check(`${width}px desktop nav keyboard focus shows an outline`, outline.style !== "none" && outline.width >= 2, JSON.stringify(outline));
  await page.context().close();
}

// Mobile navigation: expanded state, focus, containment, Escape, focus return, scroll lock, inert background
for (const [width, height] of [[390, 844], [1024, 768]]) {
  const tag = `${width}x${height}`;
  const page = await open("/services/", { width, height });
  const focusInfo = () => page.evaluate(() => ({ text: document.activeElement.getAttribute("aria-label") || document.activeElement.textContent.trim(), inNav: !!document.activeElement.closest("[data-mobile-nav], .menu-toggle") }));
  const closedState = await page.evaluate(() => { const b = document.querySelector("[data-menu-toggle]"); return { expanded: b.getAttribute("aria-expanded"), label: b.getAttribute("aria-label"), controls: b.getAttribute("aria-controls"), navHidden: getComputedStyle(document.querySelector("[data-mobile-nav]")).display === "none" }; });
  check(`${tag} closed menu: collapsed, "Open navigation", controls target exists, links out of tab order`, closedState.expanded === "false" && closedState.label === "Open navigation" && closedState.controls === "mobile-navigation" && closedState.navHidden, JSON.stringify(closedState));
  await page.click("[data-menu-toggle]");
  const opened = await page.evaluate(() => ({ expanded: document.querySelector("[data-menu-toggle]").getAttribute("aria-expanded"), label: document.querySelector("[data-menu-toggle]").getAttribute("aria-label"), lock: getComputedStyle(document.body).overflow, mainInert: document.querySelector("main").inert, footerInert: document.querySelector(".site-footer").inert }));
  check(`${tag} open menu: expanded, "Close navigation", scroll locked, background inert`, opened.expanded === "true" && opened.label === "Close navigation" && opened.lock === "hidden" && opened.mainInert && opened.footerInert, JSON.stringify(opened));
  check(`${tag} opening the menu moves focus to the first navigation link`, (await focusInfo()).text === "Home", JSON.stringify(await focusInfo()));
  let contained = true;
  const visited = new Set();
  for (let i = 0; i < 12; i += 1) { await page.keyboard.press("Tab"); const info = await focusInfo(); contained &&= info.inNav; visited.add(info.text); }
  for (let i = 0; i < 12; i += 1) { await page.keyboard.press("Shift+Tab"); contained &&= (await focusInfo()).inNav; }
  check(`${tag} Tab and Shift+Tab stay inside the open menu (links + close button)`, contained && visited.has("Close navigation") && visited.has("Contact"), [...visited].join("|"));
  check(`${tag} booking bar not shown while menu is open`, await page.evaluate(() => { const b = document.querySelector("[data-booking-bar]"); return !b || getComputedStyle(b).visibility === "hidden" || getComputedStyle(b).display === "none"; }));
  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => ({ expanded: document.querySelector("[data-menu-toggle]").getAttribute("aria-expanded"), focusIsToggle: document.activeElement === document.querySelector("[data-menu-toggle]"), lock: getComputedStyle(document.body).overflow, mainInert: document.querySelector("main").inert }));
  check(`${tag} Escape closes the menu, returns focus to the menu button, unlocks scroll and background`, closed.expanded === "false" && closed.focusIsToggle && closed.lock !== "hidden" && !closed.mainInert, JSON.stringify(closed));
  await page.click("[data-menu-toggle]");
  await page.click("[data-menu-toggle]");
  check(`${tag} closing with the button keeps focus on the button`, await page.evaluate(() => document.activeElement === document.querySelector("[data-menu-toggle]") && document.querySelector("[data-menu-toggle]").getAttribute("aria-expanded") === "false"));
  await page.click("[data-menu-toggle]");
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForTimeout(150);
  check(`${tag} resizing past the breakpoint releases scroll lock and inert regions`, await page.evaluate(() => getComputedStyle(document.body).overflow !== "hidden" && !document.querySelector("main").inert));
  await page.context().close();
}

// Contact form: progressive disclosure, preserved values, preselection, anchor offset, no hidden blockers
{
  const page = await open("/contact/", { width: 390, height: 844 });
  const fieldState = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-project-field]")].map((f) => [f.dataset.projectField, { hidden: f.hidden, disabled: f.querySelector("input,select,textarea").disabled }])));
  const visibleFields = async () => Object.entries(await fieldState()).filter(([, v]) => !v.hidden).map(([k]) => k).sort();
  const groupHidden = () => page.evaluate(() => document.querySelector("[data-project-group]").hidden);
  check("contact: project details hidden before a service is chosen", (await groupHidden()) && (await visibleFields()).length === 0);
  const hiddenOk = async () => (await page.evaluate(() => [...document.querySelectorAll("[data-project-field]")].every((f) => !f.hidden || [...f.querySelectorAll("input,select,textarea")].every((c) => c.disabled && !c.required)))) ;
  const expected = {
    Wedding: ["team-size"],
    Event: ["business-name", "deadline", "image-use", "team-size"],
    "Professional headshots": ["business-name", "deadline", "image-use", "industry", "team-size"],
    "Commercial or business photography": ["business-name", "deadline", "image-use", "industry", "team-size"],
    "Team or on-site headshots": ["business-name", "deadline", "image-use", "industry", "team-size"],
    "Trade-show or conference headshots": ["business-name", "deadline", "image-use", "industry", "team-size"],
    "Branding or lifestyle": ["business-name", "deadline", "image-use", "industry", "team-size"],
    Engagement: [], "Portrait or studio": [], Maternity: [], "Airbnb photo experience": [], Other: [],
  };
  const options = await page.evaluate(() => [...document.querySelectorAll("#service option")].map((o) => o.value).filter(Boolean));
  for (const option of options) {
    await page.selectOption("#service", option);
    const shown = await visibleFields();
    const want = expected[option];
    if (want) check(`contact: "${option}" reveals ${want.length ? want.join(", ") : "no project fields"}`, JSON.stringify(shown) === JSON.stringify(want) && (await hiddenOk()), JSON.stringify(shown));
    else check(`contact: "${option}" is a known service option`, false, "update expected map");
  }
  await page.selectOption("#service", "Professional headshots");
  await page.fill("#business-name", "Acme Co");
  await page.selectOption("#service", "Wedding");
  check("contact: hidden business field is removed from tab order and submission", (await fieldState())["business-name"].disabled === true && (await page.locator("#business-name").isHidden()));
  await page.selectOption("#service", "Event");
  check("contact: revealed field keeps its earlier value", (await page.inputValue("#business-name")) === "Acme Co");
  check("contact: progressive-disclosure status is a polite live region", await page.evaluate(() => { const s = document.querySelector("[data-project-status]"); return s.getAttribute("role") === "status" && s.getAttribute("aria-live") === "polite"; }));
  const semantics = await page.evaluate(() => ({ fieldsets: [...document.querySelectorAll("#inquiry-form fieldset")].every((f) => f.querySelector(":scope > legend")?.textContent.trim()), consent: !!document.querySelector("input[name='privacy-consent'][required]"), policy: document.querySelector(".check-field a")?.getAttribute("href"), target: document.querySelector("#inquiry-form").getAttribute("action") }));
  check("contact: fieldsets have legends, consent is required, policy link and thank-you target intact", semantics.fieldsets && semantics.consent && semantics.policy === "/privacy/" && semantics.target === "/thank-you/", JSON.stringify(semantics));
  await page.context().close();

  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const anchored = await open("/contact/#inquiry-form", { width, height });
    await anchored.waitForTimeout(900);
    const pos = await anchored.evaluate(() => ({ form: document.querySelector("#inquiry-form").getBoundingClientRect().top, header: document.querySelector(".site-header").getBoundingClientRect().bottom, firstField: document.querySelector("#name").getBoundingClientRect().top }));
    check(`${width}px contact anchor: form and first field sit below the sticky header`, pos.form >= pos.header && pos.firstField >= pos.header + 8, JSON.stringify(pos));
    await anchored.context().close();
  }

  const preselect = await open("/contact/?service=Wedding", { width: 390, height: 844 });
  check("contact: ?service=Wedding preselects and reveals only the matching field", (await preselect.inputValue("#service")) === "Wedding" && (await preselect.locator("[data-project-field]:not([hidden])").count()) === 1);
  await preselect.context().close();
  const industry = await open("/contact/?industry=Founders%20and%20Personal%20Brands", { width: 390, height: 844 });
  check("contact: ?industry= preselection reveals the business fields", (await industry.locator("[data-project-field]:not([hidden])").count()) === 5 && (await industry.locator("#industry").inputValue()) === "Founders and Personal Brands");
  await industry.context().close();

  const noJs = await open("/contact/", { width: 390, height: 844 }, { javaScriptEnabled: false });
  const noJsState = await noJs.evaluate(() => ({ visible: [...document.querySelectorAll("#inquiry-form input:not([type=hidden]), #inquiry-form select, #inquiry-form textarea, #inquiry-form button")].filter((e) => !e.closest("[hidden]") && e.offsetParent === null && e.type !== "checkbox").length, projectHidden: document.querySelector("[data-project-group]").hidden, anyDisabled: !!document.querySelector("#inquiry-form [disabled]") }));
  check("contact without JavaScript: every project field is visible and enabled", noJsState.visible === 0 && !noJsState.projectHidden && !noJsState.anyDisabled, JSON.stringify(noJsState));
  await noJs.context().close();
}

// Touch targets in the footer (were 23px tall at 390px)
{
  const page = await open("/", { width: 390, height: 844 });
  const heights = await page.evaluate(() => [...document.querySelectorAll(".footer-column a, .footer-brand .brand")].map((a) => Math.round(a.getBoundingClientRect().height)));
  check("390px footer links and brand are at least 44px tall", heights.length > 15 && Math.min(...heights) >= 44, `min ${Math.min(...heights)}`);
  await page.context().close();
}

// WCAG AA contrast (4.5:1) for the gold/brown eyebrow and kicker text fixed in this pass
{
  const targets = [["/services/", ".client-quotes .eyebrow"], ["/events/", ".feature-strip--premiere .eyebrow"], ["/events/", ".event-benefit > span"], ["/newsletter/", ".newsletter-issue__copy .update-kicker span"]];
  for (const [url, selector] of targets) {
    const page = await open(url, { width: 390, height: 844 }, { reducedMotion: "reduce" });
    const ratio = await page.evaluate((sel) => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m[1].split(/[ ,\/]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
      const mix = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const el = document.querySelector(sel);
      el.scrollIntoView();
      const layers = [];
      for (let n = el; n; n = n.parentElement) { const bg = parse(getComputedStyle(n).backgroundColor); if (bg.a > 0) { layers.push(bg); if (bg.a === 1) break; } }
      let bg = { r: 18, g: 15, b: 13, a: 1 };
      layers.reverse().forEach((layer) => { bg = mix(layer, bg); });
      const fg = mix(parse(getComputedStyle(el).color), bg);
      const [a, b] = [lum(fg), lum(bg)];
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }, selector);
    check(`contrast ${url} ${selector} >= 4.5:1`, ratio >= 4.5, ratio.toFixed(2));
    await page.context().close();
  }
}

// Reduced motion and no-JS visibility
for (const url of ["/", "/services/", "/contact/", "/about/", "/events/"]) {
  const page = await open(url, { width: 390, height: 844 }, { reducedMotion: "reduce" });
  const state = await page.evaluate(() => ({ hidden: [...document.querySelectorAll(".reveal")].filter((e) => getComputedStyle(e).opacity !== "1" || getComputedStyle(e).transform !== "none").length, smooth: getComputedStyle(document.documentElement).scrollBehavior }));
  check(`reduced motion ${url}: reveal content visible without movement, no smooth scrolling`, state.hidden === 0 && state.smooth === "auto", JSON.stringify(state));
  await page.context().close();
  const noJs = await open(url, { width: 390, height: 844 }, { javaScriptEnabled: false });
  check(`no JavaScript ${url}: reveal content visible`, await noJs.evaluate(() => [...document.querySelectorAll(".reveal")].every((e) => getComputedStyle(e).opacity === "1")));
  await noJs.context().close();
}

// Hero image: eager and preloaded on the homepage; below-the-fold images lazy
{
  const page = await open("/", { width: 390, height: 844 });
  const images = await page.evaluate(() => ({ hero: (() => { const i = document.querySelector(".hero img"); return { loading: i.getAttribute("loading"), priority: i.getAttribute("fetchpriority"), srcset: !!(i.srcset || i.parentElement.querySelector("source")?.srcset), sizes: !!(i.sizes || i.parentElement.querySelector("source")?.sizes) }; })(), preload: !!document.querySelector("link[rel=preload][as=image][fetchpriority=high]"), eagerBelowFold: [...document.querySelectorAll("img")].filter((i) => i.getBoundingClientRect().top > innerHeight * 2 && i.loading !== "lazy").length }));
  check("homepage: hero image eager with high priority, srcset/sizes and a matching preload; far images lazy", images.hero.loading !== "lazy" && images.hero.priority === "high" && images.hero.srcset && images.hero.sizes && images.preload && images.eagerBelowFold === 0, JSON.stringify(images));
  const inits = await page.evaluate(() => ({ bars: document.querySelectorAll("[data-booking-bar]").length, scripts: document.querySelectorAll("script[src*='site.js']").length }));
  check("homepage: single site.js include and no duplicate booking bar", inits.scripts === 1 && inits.bars <= 1, JSON.stringify(inits));
  await page.context().close();
}

check("no console errors, page errors or failed requests", errors.length === 0, `\n  ${[...new Set(errors)].slice(0, 15).join("\n  ")}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
