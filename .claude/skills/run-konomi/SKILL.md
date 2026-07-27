---
name: run-konomi
description: >
  Run, launch, drive, verify, or screenshot the Konomi app — start the Next.js
  dev server, drive the real UI headlessly (onboarding, tag select, Recommend,
  lock/unlock cards, read mixer error chips), and capture screenshots. Use for
  "run the app", "verify this change in the app", "smoke test", "screenshot
  the anime/film page", or any in-browser regression check.
---

# Run Konomi

Next.js web app (routes `/anime` and `/film`). Driven headlessly via
`.claude/skills/run-konomi/driver.mjs` — a playwright-core script with two
built-in scenarios plus importable helpers for custom flows. All paths below
are relative to the repo root. Verified end-to-end 2026-07-24 (macOS).

## Prerequisites

`playwright-core` is a devDependency (the driver library only — it ships no
browsers and no test runner), so a plain `npm install` covers it.

The driver finds a browser automatically: `PLAYWRIGHT_CHROMIUM_PATH` env
override → any cached Playwright Chromium (`~/Library/Caches/ms-playwright`
on macOS, `~/.cache/ms-playwright` on Linux) → system Chrome. No download
step needed on a machine that has ever installed Playwright browsers or has
Chrome.

## Run (agent path)

Start the dev server in the background and poll the port (macOS has no
`timeout` command — use the loop):

```bash
(npm run dev > /tmp/konomi-dev.log 2>&1 &)
for i in $(seq 1 60); do curl -sf http://localhost:3000/anime >/dev/null && { echo SERVER_UP; break; }; sleep 1; done
```

Then drive it:

```bash
node .claude/skills/run-konomi/driver.mjs smoke     # onboard → Random ×3 → Recommend → 5 cards + screenshot
node .claude/skills/run-konomi/driver.mjs lockflow  # lock all → "all locked" chip + Clear disabled → unlock → fresh roll
```

Screenshots land in `.claude/skills/run-konomi/shots/` (gitignored). Both
scenarios assert their expectations and exit non-zero on failure. Target the
film side with `KONOMI_URL=http://localhost:3000/film`.

For a custom flow, import the helpers instead of rediscovering selectors:

```js
import { launch, onboardIfNeeded, sel, chipText, cardTitles, lockCard, unlockCard, shot } from "./.claude/skills/run-konomi/driver.mjs";
```

Stop the server (kill the port listener — `$!` is only the npm wrapper):

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
```

## Run (human path)

`npm run dev` → open http://localhost:3000/anime. Useless headless.

## Gotchas

- **First visit + tag density.** A fresh context shows the level selector in
  the empty-state box; `onboardIfNeeded(page)` clicks anime's "not my first
  rodeo 𓄀" when present. On /film the labels differ (Moviegoer/Film buff/
  Cinephile) so that click silently no-ops and the level stays at the
  DEFAULT "1" — where only Genres/Reception/Franchise exist. Any pool/search
  scenario on film must seed the pref BEFORE goto:
  `page.addInitScript(() => localStorage.setItem("konomi:film:tagpool:level", "3"))`.
- **The tag pool is a header-anchored overlay (search v2).** Open it by
  clicking the header search field or Tag Pool button
  (`button[aria-label="Open tag pool"]`); its aria-label flips to
  "Close tag pool" while open — the reliable open-state probe
  (`[role=tab]:visible` is useless: clipped elements count as visible).
  The mixbar has NO Tag Pool button anymore; tapping an empty slot also
  toggles the overlay.
- **aria-label often matches an invisible element.** Several controls render
  two sibling forms (full text + icon-only, breakpoint-toggled), and the
  aria-label can live on the hidden one. Bare `getByLabel("Random")` resolves
  to an invisible node and times out. Always filter `:visible`.
- **The visible RANDOM has no aria-label** — it's a text button; select with
  `button:has-text("RANDOM"):visible`. Recommend is the opposite: one
  instance, unconditional `aria-label="Recommend"`.
- **Card lock/swap icons are hover-revealed.** Hover the card
  (`[data-result-card][data-title="…"]`) before clicking. The lock button's
  aria-label is the ACTION: `"lock"` to lock, `"unlock"` to unlock.
- **Mixer error chip** (under RECOMMEND) is plain text — one of `all locked`,
  `no new matches`, `no series match`, `lower MIN MATCH`. `chipText(page)`
  returns it or null.
- **Min-match buttons** by aria-label: `match 1+ tag`, `match 2+ tags`,
  `match all 3 tags` (all need `:visible` — hidden twins again).
- **Don't `pkill -f node`** to stop the server — kill the port listener
  (command above) or you can take out your own session.

## Troubleshooting

- `command not found: timeout` — macOS/zsh has no coreutils `timeout`; use
  the `for`/`curl` poll loop above.
- `locator resolved to <button …> … element is not visible` — you matched a
  hidden breakpoint twin; add `:visible` (see Gotchas).
- Click intercepted by `<button aria-label="Recommend">` or a mixer div —
  you're clicking something that sits under the MixerBar overlap (usually a
  mismatched selector, e.g. an unrelated "Close"); fix the selector rather
  than force-clicking.
- `EADDRINUSE` on relaunch — a previous dev server still owns :3000; run the
  lsof kill line first. Kill and WAIT for the port to actually free before
  starting — a raced restart leaves the OLD (stale-CSS) server running while
  the new one dies silently.
- **Fonts suddenly wrong app-wide** (mono/body rendering as system fonts) —
  next/font's Google fetch flaked during a rebuild and dev mode silently
  fell back (grep the dev log for "establishing a connection …fonts").
  Restart the server to refetch; happened twice (once as a prod build
  failure, once as a silent dev fallback after `rm -rf .next`).

## Test

No test suite. Verification here = typecheck + build + driving the app:

```bash
npx tsc --noEmit && npm run build
```
