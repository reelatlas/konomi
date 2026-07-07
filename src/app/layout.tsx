import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { SHOW_HALFTONE } from "@/lib/konomi/config";
import { THEME_KEYS, THEME_STORAGE_KEY } from "@/lib/konomi/themes";
import "./globals.css";

// Runs synchronously, before the browser parses <body> — sets the real
// persisted theme onto <html> before first paint, the standard next-themes-
// style trick for zero-flash theme restoration. Can't reach into
// KonomiApp.tsx's own root div (it doesn't exist in the DOM yet at this
// point), which is exactly why that div no longer carries its own
// data-theme copy (see KonomiApp.tsx's own comment) — everything below
// <html> now inherits these CSS custom properties instead of racing this
// script to redeclare them. THEME_KEYS interpolated (not hand-typed) so a
// future theme addition can't silently desync this allowlist from the real
// one.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEME_KEYS)}.indexOf(t)!==-1){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

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
      // data-theme="default": matches useKonomi's own initial reducer state
      // exactly (useKonomi.ts, plain literal "default") — this is what
      // React's own hydration render must also produce (server and client
      // agree, no hydration-mismatch risk), independent of whatever the
      // THEME_INIT_SCRIPT below does a moment earlier. suppressHydrationWarning
      // is required specifically because that script legitimately overwrites
      // this literal on the real DOM node before React ever hydrates it (a
      // persisted non-default theme) — a real, expected, one-way divergence
      // between server-sent markup and the live DOM at hydration time, not a
      // bug. Safe *only* because this attribute is never re-rendered by React
      // afterward (RootLayout never re-renders in response to theme changes;
      // KonomiApp.tsx's own effect updates it imperatively instead, the same
      // way THEME_INIT_SCRIPT does) — suppressHydrationWarning on a node
      // React keeps reconciling would just silence a warning about a fight
      // it's actively losing every render, not resolve one.
      suppressHydrationWarning
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
        {/* First child, deliberately — must run before the browser parses
            <body> (and therefore before first paint) to actually prevent a
            flash. A later position would still execute before paint in most
            cases, but would leave that guarantee resting on nothing else
            ever being inserted above it in the future. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
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
