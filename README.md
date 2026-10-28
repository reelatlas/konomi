# konomi

Tag remixer for anime and film. Pick up to three tags, set a match floor,
get five recommendations, lock the keepers, re-roll the rest.

Live: `/anime` (AniList data) and `/film` (TMDB data). Each side is a
catalog partition with its own tag pool and rules; the component tree and
interaction model are shared (`src/lib/konomi/domain.ts`).

## Stack

Next.js 16 (App Router, ISR) · React 19 · TypeScript strict · Tailwind 4 ·
Motion · Supabase (Postgres + RLS) · Vercel.

## Run

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Data scripts (need `SUPABASE_SECRET_KEY` / `TMDB_ACCESS_TOKEN` in `.env.local`):
`npm run import:anilist`, `npm run import:tmdb`, `npm run promote:tmdb`,
`npm run delta:tmdb`. See `DATA_SOURCING.md`.

## Gates

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

The same gates run in `.github/workflows/ci.yml`, started by hand only
(see the policy note below). Unit tests cover the pure modules in
`src/lib/konomi` (reducer, scoring, tag pool, domains, wire format); the
browser-level check is the smoke driver in `.claude/skills/run-konomi`.

## Structure

- `src/lib/konomi/` — types, the `useKonomi` reducer, scoring, tag-pool
  rules, the two `Domain` definitions, tokens and themes, the catalog wire
  format. Framework-light, DOM-free.
- `src/lib/supabase/` — the adapters that turn each side's tables into the
  shared `Series`/`TagInfo` shapes.
- `src/components/konomi/` — the UI. Every color, size, and duration comes
  from tokens (`tokens.ts`, `themes.ts`, `globals.css`).
- `src/app/` — the two routes, `api/pool` (the film side's server-side
  recommend), the shell (loading / error / global-error).
- `supabase/migrations/` — schema, RLS, grants. `scripts/` — ingest and
  promote.
- `docs/audits/` — frozen sizing baselines. `docs/proposals/` — design
  decisions still open.

Docs: `CLAUDE.md` is the router; `AGENTS.md` the hard rules;
`DESIGN_SYSTEM.md` the visual system and its history; `DATA_SOURCING.md`
the data model and measured API facts; `SANDBOX_GRADUATIONS.md` the
register of experiments that shipped or were reverted.

## What is deliberately not here (yet)

This is a personal project built for speed. Some rails a production team
would expect are off on purpose, and each has a stated trigger:

- **No CI on push.** The gates run locally before every push; the Actions
  workflow is dispatch-only. The account's shared 2,000 Actions minutes do
  not stretch to a job per push at ~40 commits an active day, and the local
  run is the same check. Trigger: a second contributor.
- **No branch protection / PR flow.** Work lands on `main` after the local
  gates. Trigger: a second contributor.
- **No error reporting service.** Failures surface as the tokened error
  boundary and `console.error`. Trigger: real traffic.
- **Client-side scoring on the anime side.** Simple and synchronous, and
  at 0.76 MB packed it is fine. The film side scores in Postgres
  (`recommend_films`, migration 0013) behind `/api/pool`, so `/film` ships
  tags only; `docs/proposals/server-side-recommend.md` has the design and
  the measured before/after. Trigger for moving anime over: the anime
  catalog outgrowing its wire budget, or wanting one code path.
- **No browser tests in CI.** The smoke driver runs on demand. Trigger: the
  first regression a unit test could not have caught.
