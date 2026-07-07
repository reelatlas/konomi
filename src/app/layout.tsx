import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { SHOW_HALFTONE } from "@/lib/konomi/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "KONOMI",
  description: "anime tag mixer",
};

// The app's mono/UI-label font — self-hosted via next/font (actually
// fetched at build time, not just referenced by a <link> the way
// Anton/Zen Kaku Gothic New still are below). Replaces Space Mono
// entirely: --font-ibm-plex-mono feeds globals.css's `@theme` block, which
// sets it as Tailwind's own `--font-mono` theme key — the same layer-
// correct approach that fixed Space Mono's font-mono cascade collision
// (see that file's own comment) applies here too, just pointed at a real
// next/font variable instead of a bare family-name string. 400/500/700
// covers every weight this app's font-mono text actually uses (500 isn't
// used yet, but the app's "chunky UI" bias toward bold labels makes a real
// medium weight worth having loaded rather than faux-bolded by the
// browser if a future label ever wants something between 400 and 700).
const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // data-theme="default": matches useKonomi's own initial reducer
      // state exactly (useKonomi.ts, plain literal "default", no
      // localStorage/async involved) — this is a real, correct default,
      // not a placeholder, so there's no hydration-mismatch/flash risk the
      // way an unknown or async-derived value would have. KonomiApp.tsx's
      // own root div still carries data-theme too (unchanged, still the
      // one place that actually reads/writes k.theme) and syncs this
      // attribute here via its own effect on every subsequent change —
      // this app's page background (below) needs to live on html/body
      // (the real scroll root — see globals.css's own comment) rather
      // than on that div, and html's --bg/--muted (theme-scoped custom
      // properties, [data-theme="…"] rules) only resolve on an element
      // that itself carries this attribute — inheritance only flows
      // downward, so html can't just inherit them from a descendant.
      data-theme="default"
      // Spread, not a plain prop — omits the attribute entirely when
      // false (SHOW_HALFTONE, config.ts) rather than rendering
      // data-halftone="false", matching data-clear-results/
      // data-theme-switcher's existing presence-only convention
      // elsewhere in this app.
      {...(SHOW_HALFTONE ? { "data-halftone": "" } : {})}
      className={`h-full ${ibmPlexMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- this is the
            App Router root layout, which already applies to every route (the
            app-dir equivalent of pages/_document.js the rule asks for).
            Anton/Zen Kaku Gothic New only now — Space Mono removed
            entirely, replaced by the self-hosted next/font load above. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
