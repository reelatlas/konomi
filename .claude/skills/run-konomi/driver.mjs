#!/usr/bin/env node
// Konomi app driver — launches headless Chromium against the dev server and
// drives the REAL UI (onboarding, tag selection, recommend, lock/unlock,
// error chips). Agent tooling, not product surface; see SKILL.md next to
// this file for setup + usage. Verified end-to-end 2026-07-24.
//
// Usage:
//   node .claude/skills/run-konomi/driver.mjs            # smoke (default)
//   node .claude/skills/run-konomi/driver.mjs lockflow   # lock-all/unlock/error-chip flow
//   KONOMI_URL=http://localhost:3000/film node .claude/skills/run-konomi/driver.mjs
//
// Or import the helpers for a custom flow:
//   import { launch, onboardIfNeeded, chipText, cardTitles, lockCard } from "./driver.mjs";

import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "shots");
export const BASE_URL = process.env.KONOMI_URL || "http://localhost:3000/anime";

// Playwright browser caches: macOS uses ~/Library/Caches/ms-playwright,
// Linux ~/.cache/ms-playwright. playwright-core ships no browsers of its
// own, so reuse whatever chromium a full playwright install left behind;
// PLAYWRIGHT_CHROMIUM_PATH overrides everything.
export function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const roots = [
    join(os.homedir(), "Library/Caches/ms-playwright"),
    join(os.homedir(), ".cache/ms-playwright"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter((d) => d.startsWith("chromium")).sort().reverse();
    for (const d of dirs) {
      const candidates = [
        join(root, d, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        join(root, d, "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        join(root, d, "chrome-linux/chrome"),
        join(root, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"),
      ];
      for (const c of candidates) if (existsSync(c)) return c;
    }
  }
  return null; // fall through to channel: "chrome" (system Chrome)
}

export async function launch({ width = 1400, height = 1000 } = {}) {
  const exe = findChromium();
  const browser = await chromium.launch(
    exe ? { executablePath: exe, headless: true } : { channel: "chrome", headless: true },
  );
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return { browser, page, errors };
}

// Fresh contexts always hit the first-visit onboarding: a level must be
// picked before the mixer controls exist. Idempotent — safe to call always.
export async function onboardIfNeeded(page) {
  const level = page.locator('button[aria-label="not my first rodeo 𓄀"]:visible');
  if (await level.count()) {
    await level.click();
    await page.waitForTimeout(500);
  }
}

// Selector notes (all verified against the live app):
// - Several controls render TWO sibling instances (full + icon-only form,
//   breakpoint-toggled). aria-label often lives on the HIDDEN one, so bare
//   getByLabel() matches an invisible node — always filter :visible.
// - The visible RANDOM is a text button with NO aria-label; select by text.
// - Recommend is one instance with an unconditional aria-label.
export const sel = {
  random: 'button:has-text("RANDOM"):visible',
  recommend: 'button[aria-label="Recommend"]:visible',
  clear: 'button[aria-label="Clear results"]:visible',
  card: "[data-result-card]",
  minMatch: (n) =>
    `button[aria-label="${n === 1 ? "match 1+ tag" : n === 2 ? "match 2+ tags" : "match all 3 tags"}"]:visible`,
};

// The mixer error chip under RECOMMEND — null when no error is showing.
export async function chipText(page) {
  const el = await page.$("text=/^(all locked|no new matches|no series match|lower MIN MATCH)$/");
  return el ? await el.textContent() : null;
}

export function cardTitles(page) {
  return page.$$eval("[data-result-card]", (els) => els.map((e) => e.getAttribute("data-title")));
}

// Lock icons are hover-revealed; hover the card first, then click the
// action-labeled button ("lock" to lock, "unlock" to unlock).
async function toggleCardLock(page, title, action) {
  const card = page.locator(`[data-result-card][data-title="${title.replace(/"/g, '\\"')}"]`);
  await card.hover();
  await card.locator(`button[aria-label="${action}"]`).click();
  await page.waitForTimeout(120);
}
export const lockCard = (page, title) => toggleCardLock(page, title, "lock");
export const unlockCard = (page, title) => toggleCardLock(page, title, "unlock");

export async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  const path = join(SHOTS, name.endsWith(".png") ? name : name + ".png");
  await page.screenshot({ path });
  return path;
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

// smoke: onboard -> Random x3 -> Recommend -> 5 cards + screenshot.
async function smoke() {
  const { browser, page, errors } = await launch();
  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await onboardIfNeeded(page);
    await page.locator(sel.random).click();
    await page.waitForTimeout(300);
    await page.locator(sel.recommend).click();
    await page.waitForSelector(sel.card);
    await page.waitForTimeout(600);
    const titles = await cardTitles(page);
    assert(titles.length > 0, "no result cards after recommend");
    const p = await shot(page, "smoke");
    console.log(`smoke OK — ${titles.length} cards:`, titles);
    console.log("screenshot:", p);
    console.log("page errors:", errors.length ? errors : "none");
    assert(errors.length === 0, "page errors logged (see above)");
  } finally {
    await browser.close();
  }
}

// lockflow: exercises lock-all -> "all locked" chip -> unlock -> fresh roll.
async function lockflow() {
  const { browser, page } = await launch();
  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await onboardIfNeeded(page);
    await page.locator(sel.random).click();
    await page.waitForTimeout(300);
    await page.locator(sel.recommend).click();
    await page.waitForSelector(sel.card);
    await page.waitForTimeout(600);
    const titles = await cardTitles(page);
    for (const t of titles) await lockCard(page, t);
    await page.locator(sel.recommend).click();
    await page.waitForTimeout(400);
    const chip1 = await chipText(page);
    console.log("all locked -> press -> chip:", chip1);
    assert(chip1 === "all locked", `expected 'all locked' chip, got ${chip1}`);
    const clearDisabled = await page.locator(sel.clear).evaluate((el) => el.disabled);
    assert(clearDisabled, "Clear results should be disabled while all locked");
    await unlockCard(page, titles[0]);
    assert((await chipText(page)) === null, "chip should clear on unlock");
    await page.locator(sel.recommend).click();
    await page.waitForTimeout(700);
    const after = await cardTitles(page);
    assert(JSON.stringify(after) !== JSON.stringify(titles), "roll after unlock should change titles");
    console.log("lockflow OK — screenshot:", await shot(page, "lockflow"));
  } finally {
    await browser.close();
  }
}

const scenario = process.argv[2] || "smoke";
const scenarios = { smoke, lockflow };
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!scenarios[scenario]) {
    console.error(`unknown scenario "${scenario}" — one of: ${Object.keys(scenarios).join(", ")}`);
    process.exit(2);
  }
  scenarios[scenario]().catch((e) => {
    console.error("DRIVER FAILED:", e.message || e);
    process.exit(1);
  });
}
