#!/usr/bin/env node
// Control-sizing inventory generator — the reproducible half of
// docs/audits/SIZING_AUDIT.md. Joins AUTHORED values (a hand-curated
// registry below, each entry verified to still exist in source, so the
// script fails loudly on drift) with MEASURED values (live app via the
// run-konomi driver). Re-run after any control change and diff the JSON
// against the committed baseline instead of re-measuring by hand.
//
//   node scripts/audit-controls.mjs            # writes docs/audits/sizing-inventory.json
//
// Requires the dev server on :3000 (see .claude/skills/run-konomi/SKILL.md).
// Scope decisions (ruled 2026-07-26, see SIZING_AUDIT.md):
// - One entry per control VARIANT × CONTEXT, not per rendered node.
// - Geometry + all interaction states in the DEFAULT theme only — themes
//   are color-only by type-level invariant (ThemeColors, types.ts), so
//   geometry cannot vary; dark/third capture resting+disabled COLORS only.
// - Responsive form set comes from STATIC source parsing (the rung
//   classes), plus one 390×844@3 spot pass for presence + fluid values —
//   controls here swap fixed-size sibling forms, they don't fluidly
//   resize, so a full mobile measurement axis would re-measure known
//   tiers (emulated; iPhone stays ground truth for feel).
// - Border rasterization measured at DPR 1/2/3 via device-pixel-content-box.

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { findChromium, onboardIfNeeded, sel } from "../.claude/skills/run-konomi/driver.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/audits/sizing-inventory.json");
const BASE_URL = process.env.KONOMI_URL || "http://localhost:3000/film";

// ---------------------------------------------------------------- registry
// `authored`: the source-of-truth values per property, each tagged
// token|literal|derived. `verify`: substrings that MUST exist in `file` —
// the drift alarm. `states`: which interaction states to capture.
// `activeSafe`: false when a mousedown alone starts something (drag).
const R = (o) => o;
const registry = [
  R({ id: "header/search-field", component: "ResultsHeader input", file: "src/components/konomi/ResultsHeader.tsx",
      selector: 'input[aria-label="Search all tag sections"]',
      authored: { height: { v: "--control-h-md 44px", kind: "token" }, width: { v: "min(200px,40vw)", kind: "literal", src: "w-[min(200px,40vw)]" },
        font: { v: "--text-sm 12px", kind: "token" }, padX: { v: "--space-lg 12px", kind: "token" }, border: { v: "--border-base 2px", kind: "token" } },
      verify: ["h-[var(--control-h-md)] w-[min(200px,40vw)]"], states: ["hover", "focus"] }),
  R({ id: "header/tagpool-btn", component: "ActionButton md outline|filled", file: "src/components/konomi/ActionButton.tsx",
      selector: 'button[aria-label="Close tag pool"], button[aria-label="Open tag pool"]',
      authored: { height: { v: "--control-h-md 44px", kind: "token", src: "SIZE_CLASSES.md" }, font: { v: "--text-xs 11px", kind: "token" },
        padX: { v: "--space-xl 16px", kind: "token" }, border: { v: "--border-base 2px", kind: "token" }, shadow: { v: "none (header row is flat — shadow tiers ruling)", kind: "token" } },
      verify: ["inline-flex h-[var(--control-h-md)]"], states: ["hover", "focus", "active"] }),
  R({ id: "header/filter-btn", component: "IconButton sm", file: "src/components/konomi/IconButton.tsx",
      selector: "[data-results-filter] button",
      authored: { height: { v: "--control-h-md 44px", kind: "token", src: "SIZE_PX.md" }, border: { v: "--border-base 2px", kind: "token" },
        shadow: { v: "none", kind: "literal" }, icon: { v: "20px (control tier)", kind: "literal", src: "w-[20px] h-[20px] at call site — tier rule: 20 control / 16 dense" } },
      verify: ['md: "var(--control-h-md)"'], states: ["hover", "focus", "active"] }),
  R({ id: "header/clear-btn", component: "ActionButton sm inverted", file: "src/components/konomi/ResultsHeader.tsx",
      selector: 'button[aria-label="Clear results"]',
      authored: { height: { v: "--control-h-md 44px", kind: "token", src: "SIZE_CLASSES.md" }, font: { v: "--text-xs 11px", kind: "token" },
        shadow: { v: "none (inverted variant)", kind: "literal" } },
      verify: ["variant=\"inverted\""], states: ["hover", "focus", "disabled:static"] }),
  R({ id: "header/meta-readout", component: "ResultsHeader metadata", file: "src/components/konomi/ResultsHeader.tsx",
      selector: 'button[aria-label*="locked"]',
      authored: { height: { v: "content (18px icon box)", kind: "derived" }, font: { v: "--text-xs 11px", kind: "token" } },
      verify: ["w-[18px] h-[18px]"], states: ["hover"] }),
  R({ id: "popover/level-segment", component: "LevelSelector (full)", file: "src/components/konomi/LevelSelector.tsx",
      selector: '[data-results-filter] [role="dialog"] div.relative.flex',
      authored: { height: { v: "--control-h-md 44px (wrapper, fixed)", kind: "token" },
        font: { v: "--text-xs 11px", kind: "token" }, border: { v: "--border-base 2px", kind: "token" }, shadow: { v: "--elev-2 3px", kind: "token" } },
      verify: ["h-[var(--control-h-md)] border-[length:var(--border-base)]"], states: [] }),
  R({ id: "popover/level-option", component: "LevelSelector option btn", file: "src/components/konomi/LevelSelector.tsx",
      selector: '[data-results-filter] [role="dialog"] div.relative.flex button',
      authored: { height: { v: "wrapper-stretch of --control-h-md (fixed)", kind: "token" }, padX: { v: "--space-lg 12px", kind: "token" } },
      verify: ["flex-1 inline-flex items-center justify-center"], states: ["hover", "focus", "active"] }),
  R({ id: "popover/sort-select", component: "SortSelect", file: "src/components/konomi/SortSelect.tsx",
      selector: "[data-results-filter] select",
      authored: { height: { v: "--control-h-md 44px (fixed)", kind: "token" },
        font: { v: "--text-xs 11px", kind: "token" }, border: { v: "--border-base 2px", kind: "token" }, shadow: { v: "--elev-2 3px", kind: "token" } },
      verify: ["appearance-none h-[var(--control-h-md)]"], states: ["hover", "focus"] }),
  R({ id: "panel/section-tab", component: "SectionTabStrip primary", file: "src/components/konomi/SectionTabStrip.tsx",
      selector: '[id^="tagpool-tab-"]',
      authored: { height: { v: "content (Anton --text-lg line box)", kind: "derived" }, font: { v: "--text-lg 20px display", kind: "token" } },
      verify: ["flex shrink-0 cursor-pointer items-center"], states: ["hover", "focus"] }),
  R({ id: "panel/sub-tab", component: "SectionTabStrip secondary", file: "src/components/konomi/SectionTabStrip.tsx",
      selector: '[id^="tagpool-sub-tab-"]',
      authored: { height: { v: "16px pinned line box (leading-[16px])", kind: "literal" }, font: { v: "--text-xs 11px (bumped from 2xs, user-ruled)", kind: "token" } },
      verify: ["size === \"primary\""], states: ["hover", "focus"] }),
  R({ id: "panel/chip-small", component: "TagChip small", file: "src/components/konomi/TagChip.tsx",
      selector: '[id^="tagpool-panel-"] div.flex.flex-wrap > button',
      authored: { height: { v: "--control-h-sm 30px (fixed)", kind: "token" },
        font: { v: "length-tiered xs 11 → 2xs 10 (>24ch) → 3xs 9 (>32ch), smallChipSizeClass — TagSlot precedent, user-ruled", kind: "token" }, border: { v: "--border-base 2px", kind: "token" }, radius: { v: "--radius-chip 2px", kind: "token" } },
      verify: ["h-[var(--control-h-sm)] border-[length:var(--border-base)]"], states: ["hover", "focus", "active"] }),
  R({ id: "panel/icon-btn", component: "IconButton sm border=none (snap/close/grip)", file: "src/components/konomi/TagPoolOverlay.tsx",
      selector: '[data-tagpool-overlay] button[aria-label="Close"]',
      authored: { height: { v: "30 (SIZE_PX.sm)", kind: "literal" }, border: { v: "none", kind: "literal" }, icon: { v: "16px", kind: "literal" } },
      verify: ["border=\"none\""], states: ["hover", "focus"] }),
  R({ id: "mixbar/slot", component: "TagSlot", file: "src/components/konomi/TagSlot.tsx",
      selector: "[data-mixer-bar] [data-slot]",
      authored: { height: { v: "--control-h-md 44px", kind: "token" }, width: { v: "78px", kind: "literal", src: "w-[78px]" },
        border: { v: "--border-base 2px", kind: "token" }, shadow: { v: "elev-2-selected 3px (filled) / none (empty) — the selected color-swap rule", kind: "token" },
        font: { v: "auto-shrink sm→3xs (12→9px)", kind: "token" } },
      verify: ["w-[78px] h-[var(--control-h-md)]"], states: ["hover"] }),
  R({ id: "mixbar/clear-btn", component: "ActionButton md outline", file: "src/components/konomi/MixerBar.tsx",
      selector: '[data-mixer-bar] .hidden.\\@min-\\[975px\\]\\:block button, [data-mixer-bar] div[class*="@min-[975px]:block"] button',
      authored: { height: { v: "--control-h-md 44px", kind: "token" }, font: { v: "--text-xs 11px", kind: "token" },
        padX: { v: "--space-xl 16px", kind: "token" }, border: { v: "--border-base 2px", kind: "token" }, shadow: { v: "--elev-2 3px", kind: "token" },
        iconGap: { v: "--space-sm 6px", kind: "token" } },
      verify: ["variant=\"outline\" onClick={onClearSlots}"], states: ["hover", "focus", "active"] }),
  R({ id: "mixbar/minmatch-segment", component: "MatchSelector (full)", file: "src/components/konomi/MatchSelector.tsx",
      selector: "[data-mixer-bar] div.relative.flex",
      authored: { height: { v: "--control-h-md 44px (wrapper, fixed)", kind: "token" },
        border: { v: "--border-base 2px", kind: "token" }, shadow: { v: "--elev-2 3px", kind: "token" } },
      verify: ["h-[var(--control-h-md)] border-[length:var(--border-base)]"], states: [] }),
  R({ id: "mixbar/random-btn", component: "ActionButton md filled", file: "src/components/konomi/MixerBar.tsx",
      selector: null, findByText: "RANDOM",
      authored: { height: { v: "--control-h-md 44px", kind: "token" }, shadow: { v: "--elev-2 3px", kind: "token" }, iconGap: { v: "--space-sm 6px", kind: "token" } },
      verify: ["variant=\"filled\" onClick={onRandomTags}"], states: ["hover", "focus", "active"] }),
  R({ id: "mixbar/recommend-btn", component: "RecommendButton (ActionButton md accent)", file: "src/components/konomi/RecommendButton.tsx",
      selector: 'button[aria-label="Recommend"]',
      authored: { height: { v: "--control-h-md 44px", kind: "token" }, shadow: { v: "--elev-4 5px", kind: "token" }, font: { v: "--text-xs 11px", kind: "token" } },
      verify: ["accentColor"], states: ["hover", "focus", "disabled:pre-measured"] }),
  R({ id: "card/chip", component: "TagChip small (card context)", file: "src/components/konomi/TagChip.tsx",
      selector: "[data-result-card] button[data-tag]",
      authored: { height: { v: "--control-h-sm 30px (fixed, same as panel/chip-small)", kind: "token" } },
      verify: ["h-[var(--control-h-sm)] border-[length:var(--border-base)]"], states: ["hover"] }),
  R({ id: "card/lock-btn", component: "IconButton sm thin shadow", file: "src/components/konomi/ResultCard.tsx",
      selector: '[data-result-card] button[aria-label="lock"]',
      authored: { height: { v: "30 (SIZE_PX.sm)", kind: "literal" }, border: { v: "--border-base 2px", kind: "token" },
        shadow: { v: "--elev-1 2px", kind: "token" }, icon: { v: "16px", kind: "literal" } },
      verify: ["aria-label"], states: ["hover", "focus"], hoverParent: "[data-result-card]" }),
];

// Static form map: the responsive rung classes per file — which sibling
// forms exist and where they cut over. Parsed from source, not measured.
const formMapSources = [
  { file: "src/components/konomi/MixerBar.tsx", label: "mixbar row ladder" },
  { file: "src/components/konomi/ResultsHeader.tsx", label: "header forms" },
  { file: "src/components/konomi/RecommendationsBody.tsx", label: "empty-state surfaced" },
  { file: "src/components/konomi/RecommendButton.tsx", label: "recommend icon form" },
];
const RUNG_RE = /@?(?:max|min)-\[\d+px\]:[a-z-]+|max-\[\d+px\]:[a-z-]+|min-\[\d+px\]:[a-z-]+/g;

// Dead-variant scan: declared options vs call-site usage.
const deadVariantChecks = [
  { what: "ActionButton variant", options: ["outline", "filled", "inverted", "accent"], pattern: (o) => `variant="${o}"` },
  { what: "ActionButton size", options: ["md", "sm"], pattern: (o) => `size="${o}"` },
  { what: "IconButton border", options: ["hair", "thin", "base", "none"], pattern: (o) => `border="${o}"` },
  { what: "IconButton shape", options: ["circle", "square"], pattern: (o) => `shape="${o}"` },
  { what: "IconButton shadow", options: ["elev-1", "elev-2"], pattern: (o) => `shadow="${o}"` },
  { what: "elevation token", options: ["elev-1", "elev-2", "elev-3", "elev-4", "elev-5", "elev-2-accent", "elev-3-accent"], pattern: (o) => `var(--${o})` },
  { what: "border token", options: ["border-hair", "border-base"], pattern: (o) => `var(--${o})` },
  { what: "type token", options: ["text-2xl", "text-xl", "text-lg", "text-md", "text-base", "text-sm", "text-xs", "text-2xs", "text-3xs"], pattern: (o) => `var(--${o})` },
  { what: "space token", options: ["space-xs", "space-sm", "space-md", "space-lg", "space-xl", "space-2xl", "space-3xl", "space-huge", "space-page"], pattern: (o) => `var(--${o})` },
];

function grepCount(pattern) {
  try {
    const out = execSync(
      `grep -ro ${JSON.stringify(pattern)} --include='*.tsx' --include='*.ts' --include='*.css' src | wc -l`,
      { cwd: ROOT, encoding: "utf8" },
    );
    return parseInt(out.trim(), 10);
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------ measurement
const CAPTURE_PROPS = `(el) => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  // effective background: walk up past transparent layers
  let bg = cs.backgroundColor, node = el;
  while (node && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
    node = node.parentElement;
    if (node) bg = getComputedStyle(node).backgroundColor;
  }
  const svg = el.querySelector("svg");
  const flexInner = el.querySelector("span.inline-flex, div.inline-flex");
  return {
    w: +r.width.toFixed(2), h: +r.height.toFixed(2),
    fontSize: cs.fontSize, fontFamily: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
    fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing,
    padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(" "),
    border: cs.borderTopWidth, borderColor: cs.borderTopColor, radius: cs.borderTopLeftRadius,
    boxShadow: cs.boxShadow === "none" ? "none" : cs.boxShadow,
    background: cs.backgroundColor, effectiveBg: bg, color: cs.color,
    outline: cs.outlineStyle === "none" ? "none" : cs.outlineWidth + " " + cs.outlineStyle + " offset " + cs.outlineOffset,
    opacity: cs.opacity, cursor: cs.cursor,
    transition: cs.transitionProperty === "all" && cs.transitionDuration === "0s" ? "none" : cs.transitionProperty + " " + cs.transitionDuration + " " + cs.transitionTimingFunction,
    iconSize: svg ? getComputedStyle(svg).width + "×" + getComputedStyle(svg).height : null,
    iconLabelGap: flexInner ? getComputedStyle(flexInner).columnGap : null,
  };
}`;

// WCAG contrast from two computed rgb() strings.
const CONTRAST_FN = `(fg, bg) => {
  const lum = (c) => {
    const m = c.match(/\\d+(\\.\\d+)?/g).map(Number);
    const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return +(((l1 + 0.05) / (l2 + 0.05))).toFixed(2);
}`;

async function locate(page, entry) {
  if (entry.selector) {
    const el = page.locator(entry.selector).first();
    if ((await el.count()) === 0) return null;
    return el;
  }
  if (entry.findByText) {
    const el = page.locator(`[data-mixer-bar] button:has-text("${entry.findByText}"):visible`).first();
    return (await el.count()) ? el : null;
  }
  return null;
}

async function captureEntry(page, entry) {
  const el = await locate(page, entry);
  if (!el) return { id: entry.id, missing: true };
  const capture = () => el.evaluate(new Function("el", `return (${CAPTURE_PROPS})(el)`));
  const resting = await capture();
  const contrast = await page.evaluate(
    ([f, fg, bg]) => new Function("return " + f)()(fg, bg),
    [CONTRAST_FN, resting.color, resting.effectiveBg],
  );
  const states = {};
  for (const s of entry.states ?? []) {
    try {
      if (s === "hover") {
        if (entry.hoverParent) await page.locator(entry.hoverParent).first().hover();
        await el.hover();
        await page.waitForTimeout(120);
        states.hover = await capture();
      } else if (s === "focus") {
        await el.evaluate((n) => n.focus({ focusVisible: true, preventScroll: true }));
        await page.waitForTimeout(80);
        states.focusVisible = await capture();
        await el.evaluate((n) => n.blur());
      } else if (s === "active") {
        const box = await el.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(80);
          states.active = await capture();
          await page.mouse.move(4, 4); // slide off before release so no click fires
          await page.mouse.up();
          await page.waitForTimeout(120);
        }
      }
    } catch (e) {
      states[s] = { error: String(e).slice(0, 120) };
    }
  }
  return { id: entry.id, component: entry.component, file: entry.file, authored: entry.authored, measured: { resting, contrast, states } };
}

// ---------------------------------------------------------------- drivers
async function launchAt({ width, height, dpr }) {
  const exe = findChromium();
  const browser = await chromium.launch(exe ? { executablePath: exe, headless: true } : { channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  await page.addInitScript(() => localStorage.setItem("konomi:film:tagpool:level", "3"));
  return { browser, page };
}

async function intoFullState(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await onboardIfNeeded(page);
  await page.waitForTimeout(400);
}

async function main() {
  const warnings = [];

  // 0. Verify authored snippets still exist in source (drift alarm).
  for (const entry of registry) {
    const src = readFileSync(join(ROOT, entry.file), "utf8");
    for (const v of entry.verify) {
      if (!src.includes(v)) warnings.push(`DRIFT: ${entry.id} — "${v}" not found in ${entry.file}`);
    }
  }

  // 1. Main capture: default theme, desktop, DPR 1.
  const { browser, page } = await launchAt({ width: 1400, height: 1000, dpr: 1 });
  await intoFullState(page);

  // RECOMMEND's native disabled state exists at rest (0 tags) — capture first.
  const recommendDisabled = await page
    .locator('button[aria-label="Recommend"]')
    .evaluate(new Function("el", `return (${CAPTURE_PROPS})(el)`));

  // Build the full surface: results + open overlay + open popover.
  await page.locator(sel.random).click();
  await page.waitForTimeout(300);
  await page.locator(sel.recommend).click();
  await page.waitForSelector(sel.card);
  await page.waitForTimeout(800);
  await page.locator('input[aria-label="Search all tag sections"]').click();
  await page.waitForTimeout(500);
  await page.locator("[data-results-filter] button").first().click();
  await page.waitForTimeout(400);

  // Popover entries FIRST: any later mouse.down outside the popover (the
  // active-state captures) dismisses it via its own outside-pointerdown
  // listener, so its controls must be measured before any of that runs.
  const popoverIds = new Set(["popover/level-segment", "popover/level-option", "popover/sort-select"]);
  const entries = [];
  for (const entry of registry.filter((e) => popoverIds.has(e.id))) entries.push(await captureEntry(page, entry));
  // Switch to a two-tier section (People) so the sub-tab tier exists.
  await page.evaluate(() => document.getElementById("tagpool-tab-people")?.click());
  await page.waitForTimeout(400);
  for (const entry of registry.filter((e) => !popoverIds.has(e.id))) entries.push(await captureEntry(page, entry));
  const recEntry = entries.find((e) => e.id === "mixbar/recommend-btn");
  if (recEntry?.measured) recEntry.measured.states.disabled = recommendDisabled;
  await browser.close();

  // 2. Alt themes: resting + disabled COLORS only (theme system is
  //    color-only by construction — ThemeColors carries no dimensions).
  const themeColors = {};
  for (const theme of ["dark", "third"]) {
    const t = await launchAt({ width: 1400, height: 1000, dpr: 1 });
    await t.page.addInitScript((th) => localStorage.setItem("konomi-theme", th), theme);
    await intoFullState(t.page);
    const recDisabled = await t.page
      .locator('button[aria-label="Recommend"]')
      .evaluate(new Function("el", `return (${CAPTURE_PROPS})(el)`));
    await t.page.locator(sel.random).click();
    await t.page.waitForTimeout(300);
    await t.page.locator(sel.recommend).click();
    await t.page.waitForSelector(sel.card);
    await t.page.waitForTimeout(700);
    await t.page.locator('input[aria-label="Search all tag sections"]').click();
    await t.page.waitForTimeout(400);
    const rows = {};
    for (const entry of registry) {
      const el = await locate(t.page, entry);
      if (!el) continue;
      const c = await el.evaluate(new Function("el", `return (${CAPTURE_PROPS})(el)`));
      const contrast = await t.page.evaluate(
        ([f, fg, bg]) => new Function("return " + f)()(fg, bg),
        [CONTRAST_FN, c.color, c.effectiveBg],
      );
      rows[entry.id] = { color: c.color, background: c.effectiveBg, borderColor: c.borderColor, contrast };
    }
    rows["recommend/disabled"] = { color: recDisabled.color, background: recDisabled.effectiveBg, contrast: await t.page.evaluate(
      ([f, fg, bg]) => new Function("return " + f)()(fg, bg),
      [CONTRAST_FN, recDisabled.color, recDisabled.effectiveBg],
    ) };
    themeColors[theme] = rows;
    await t.browser.close();
  }

  // 3. Mobile spot pass: 390×844 @ DPR 3 (iPhone-class, EMULATED — the
  //    real device stays ground truth). Presence + fluid values only.
  const m = await launchAt({ width: 390, height: 844, dpr: 3 });
  await intoFullState(m.page);
  const mobile = await m.page.evaluate(() => {
    // First VISIBLE match, not first DOM match — the responsive sibling-form
    // idiom means most controls have a hidden twin earlier in the DOM.
    const vis = (q) => {
      const els = [...document.querySelectorAll(q)];
      if (!els.length) return null;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      }
      return { hidden: true };
    };
    const surfacedRandom = (() => {
      const b = [...document.querySelectorAll("[data-empty-controls] button")].find((x) =>
        /random/i.test((x.textContent || "") + (x.getAttribute("aria-label") || "")),
      );
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return r.width > 0 ? { w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : { hidden: true };
    })();
    return {
      searchField: vis('input[aria-label="Search all tag sections"]'),
      headerTagPoolIconForm: vis('button[aria-label="Open tag pool"]'),
      mixbarClearIconForm: vis('[data-mixer-bar] button[aria-label="Clear"]'),
      mixbarRandomIconForm: vis('[data-mixer-bar] button[aria-label="Random"]'),
      minMatchCollapsed: vis("[data-mixer-bar] div.relative.flex"),
      recommend: vis('button[aria-label="Recommend"]'),
      slot: vis("[data-mixer-bar] [data-slot]"),
      surfacedRandom,
    };
  });
  await m.browser.close();

  // 4. Border rasterization at DPR 1/2/3 — screenshot pixel-count.
  //    (device-pixel-content-box was tried first and reports against the
  //    REAL screen DPR, ignoring emulation — measured 96 CSS px at an
  //    emulated DPR 2. Screenshots DO render at the emulated scale factor,
  //    so: render padding-less bordered divs at known positions, screenshot,
  //    draw into a canvas in-page, and count the dark-pixel run of the left
  //    border edge at the div's vertical midline.)
  const borderRaster = {};
  for (const dpr of [1, 2, 3]) {
    const b = await launchAt({ width: 600, height: 400, dpr });
    await b.page.goto("about:blank");
    await b.page.evaluate(() => {
      document.body.style.cssText = "margin:0;background:#fff;";
      const mk = (bw, top) => {
        const d = document.createElement("div");
        d.style.cssText = `position:absolute;left:50px;top:${top}px;width:100px;height:50px;border:${bw} solid #000;padding:0;box-sizing:border-box;background:#fff;`;
        document.body.appendChild(d);
      };
      mk("1.5px", 40); mk("2px", 140); mk("2.5px", 240);
    });
    await b.page.waitForTimeout(120);
    const png = (await b.page.screenshot()).toString("base64");
    borderRaster[`dpr${dpr}`] = await b.page.evaluate(
      ([data, scale]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const runAt = (topCss) => {
              const y = Math.round((topCss + 25) * scale);
              const row = ctx.getImageData(0, y, c.width, 1).data;
              let x = Math.round(45 * scale);
              while (x < c.width && row[x * 4] > 128) x++; // skip white lead-in
              let run = 0;
              while (x < c.width && row[x * 4] <= 128) { run++; x++; }
              return run;
            };
            resolve({ "hair-1.5px": runAt(40), "thin-2px": runAt(140), "base-2.5px": runAt(240) });
          };
          img.src = "data:image/png;base64," + data;
        }),
      [png, dpr],
    );
    await b.browser.close();
  }

  // 5. Static: responsive form map + dead variants + token usage.
  const formMap = {};
  for (const s of formMapSources) {
    const src = readFileSync(join(ROOT, s.file), "utf8");
    formMap[s.label] = [...new Set(src.match(RUNG_RE) ?? [])].sort();
  }
  const variantUsage = deadVariantChecks.map((c) => ({
    what: c.what,
    usage: Object.fromEntries(c.options.map((o) => [o, grepCount(c.pattern(o))])),
  }));

  // ------------------------------------------------------------- output
  const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  const result = {
    meta: {
      generated: new Date().toISOString(),
      commit: sha,
      treeDirty: dirty,
      url: BASE_URL,
      primaryCapture: { viewport: "1400x1000", dpr: 1, theme: "default", side: "film", level: "3 (seeded)" },
      note:
        "Frozen pre-migration baseline (see docs/audits/SIZING_AUDIT.md). Geometry captured in default theme only — themes are color-only by type (ThemeColors). Mobile pass is EMULATED (390x844@3); on-device iPhone remains ground truth.",
    },
    warnings,
    controls: entries,
    themeColors,
    mobileSpotPass: mobile,
    borderRasterizationDevicePx: borderRaster,
    responsiveFormMap: formMap,
    variantUsage,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 1) + "\n");
  console.log(`wrote ${OUT}`);
  console.log(`controls: ${entries.length} (${entries.filter((e) => e.missing).length} missing)`);
  if (warnings.length) console.log("WARNINGS:\n" + warnings.join("\n"));
}

main().catch((e) => {
  console.error("AUDIT FAILED:", e);
  process.exit(1);
});
