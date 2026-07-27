import type { Metadata, Viewport } from "next";
import { MotionConfig } from "motion/react";
import { Anton, IBM_Plex_Mono, Zen_Kaku_Gothic_New } from "next/font/google";
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

// maximumScale: 1 — suppresses iOS Safari's AUTOMATIC zoom when focusing
// an input whose font-size is under 16px (the global search field is 12px
// mono; the auto-zoom blew the viewport past 100% the moment the keyboard
// rose, hiding the open tag panel and the result cards — the exact context
// the search feature exists to keep visible; user-reported 2026-07-26).
// NOT an accessibility trade: since iOS 10, Safari deliberately IGNORES
// maximum-scale for user-initiated pinch zoom and honors it only for the
// automatic focus zoom — so users can still zoom freely; only the surprise
// auto-zoom is prevented. (The alternative — bumping the input font to
// 16px — would couple the type scale to a WebKit behavior.) Confirm
// on-device with the next mobile pass; emulation doesn't reproduce the
// focus-zoom behavior.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "KONOMI",
  description: "anime tag mixer",
};

// The app's mono/UI-label font — self-hosted via next/font (actually
// fetched at build time, not just referenced by a <link>, the same
// mechanism Anton/Zen Kaku Gothic New now use too, below). Replaces Space
// Mono entirely: --font-ibm-plex-mono feeds globals.css's `@theme` block, which
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

// Anton/Zen Kaku Gothic New — migrated off the plain <link>/fonts.googleapis.com
// stylesheet below (removed) onto next/font/google, same self-hosted-at-
// build-time mechanism IBM Plex Mono already uses above. Two real problems
// with the old <link> approach, both now fixed for free: (1) it required an
// extra round trip to fonts.googleapis.com/fonts.gstatic.com the self-hosted
// files skip entirely; (2) more importantly, next/font/google automatically
// generates a fallback font (matched to the real font's own metrics —
// ascent/descent/line-gap/size-adjust) and serves that as the immediate
// `font-family` fallback, specifically so the swap from fallback to the real
// downloaded font doesn't reflow anything — a plain <link> gets none of that,
// it's just font-display:swap with the *browser's own generic* fallback
// (whatever sans-serif it picks), whose metrics have no relationship to
// Anton/Zen Kaku Gothic New's real ones. Confirmed live as a real, measured
// bug from exactly this gap: every fresh page load showed a constant, exact
// 55px `document.documentElement.scrollHeight` jump ~350-600ms after
// navigation (Playwright, sampled every animation frame) — constant
// regardless of which randomized empty-state phrase happened to be showing
// at the time (ruling out "content is a different length" as the cause,
// since a content-length effect would vary the jump size), and it landed
// close to font-loadingdone timing for exactly these two fonts. Same class
// of fix as the Space Mono → IBM Plex Mono migration above (see that
// constant's own comment) plus this additional CLS benefit, which Space
// Mono's own migration didn't specifically need to solve.
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});
const zenKakuGothicNew = Zen_Kaku_Gothic_New({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-zen-kaku-gothic-new",
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
      className={`h-full ${ibmPlexMono.variable} ${anton.variable} ${zenKakuGothicNew.variable}`}
    >
      <head>
        {/* First child, deliberately — must run before the browser parses
            <body> (and therefore before first paint) to actually prevent a
            flash. A later position would still execute before paint in most
            cases, but would leave that guarantee resting on nothing else
            ever being inserted above it in the future. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* No preconnect/stylesheet <link> to fonts.googleapis.com/
            fonts.gstatic.com anymore — Anton and Zen Kaku Gothic New are
            both self-hosted via next/font/google now (see that call's own
            comment above), so there's no external font request left to
            preconnect for. */}
      </head>
      <body className="h-full">
        {/* reducedMotion="user": every motion.* component in this app
            (ResultCard.tsx/RollingLabel.tsx, MixerBar.tsx once migrated —
            see DESIGN_SYSTEM.md) now defers to this ONE app-wide switch
            instead of each component running its own
            matchMedia("(prefers-reduced-motion: reduce)") check. "user"
            (not "always") tracks the OS/browser's live prefers-reduced-motion
            setting — Motion's own documented default split for this mode:
            transform/layout animations are disabled outright, while
            opacity/backgroundColor keep animating — which is exactly the
            "instant OR simple fade, no motion" reduced-motion behavior this
            app's card-animation feature was already built to (and
            previously hand-implemented per component, e.g. the old
            result-card-enter/-exit keyframes' own prefers-reduced-motion
            override in globals.css, removed alongside this). Placed here
            (RootLayout), not KonomiApp.tsx's own root div, so it wraps
            every motion.* component in the tree with zero risk of a future
            addition landing outside it. MotionConfig is itself a client
            component (motion/react) — safe to render straight out of this
            server component the normal Next.js way; nothing here needs
            "use client" of its own. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}
