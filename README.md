# konomi

anime tag remixer

Pick up to 3 tags, get your top series recommendations, remix.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/lib/konomi/` — data, types, design tokens, and the `useKonomi` state/logic hook. Framework-light, no DOM-specific code, so it can eventually be shared with a React Native client.
- `src/components/konomi/` — the web UI, built from Tailwind classes referencing the CSS custom properties defined in `src/app/globals.css`.

Mock data only for now — no database or API.
