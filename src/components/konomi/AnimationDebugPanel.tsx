"use client";

import { useState } from "react";
import {
  ANIMATION_DEBUG_DEFAULTS,
  NAMED_EASES,
  resetAnimationDebugValues,
  setAnimationDebugValue,
  useAnimationDebugValues,
  type AnimationDebugValues,
  type NamedEase,
} from "./animationDebugStore";

// A temporary tuning aid, not a real app feature — see animationDebugStore.ts's
// own top-of-file comment for the full reasoning (why this exists, why it's
// in-memory only, and what to do once the Motion migration's remaining
// feel/timing questions are settled: delete this file, inline the settled
// numbers back into MixerBar.tsx/RollingLabel.tsx/cardAnimTuning.ts as plain
// constants, and remove every getAnimationDebugValues()/useAnimationDebugValues()
// call site). Rendered once, at KonomiApp.tsx's own root, so it's reachable
// regardless of which specific control is being tuned.
//
// Deliberately plain/functional styling, not this app's own bordered/
// shadowed card treatment (DESIGN_SYSTEM.md) — a debug tool that visually
// blended in with real UI would be more likely to get mistaken for one.
const NUMBER_FIELDS: { key: keyof AnimationDebugValues; label: string; min: number; max: number; step: number; group: string }[] = [
  { key: "editPanelTransitionMs", label: "duration (ms)", min: 0, max: 1000, step: 10, group: "MixerBar panel (open/close/resize)" },
  { key: "rollDurationMs", label: "duration (ms)", min: 0, max: 1000, step: 10, group: "RollingLabel roll (MatchSelector/LevelSelector/SortSelect)" },
  { key: "cardDurationMs", label: "duration (ms)", min: 0, max: 1000, step: 10, group: "Result card enter/exit" },
  { key: "cardStaggerMs", label: "stagger (ms, at 5 cards)", min: 0, max: 200, step: 5, group: "Result card enter/exit" },
  { key: "cardDistancePx", label: "rise/sink distance (px)", min: 0, max: 60, step: 1, group: "Result card enter/exit" },
];

const EASE_FIELDS: { key: keyof AnimationDebugValues; label: string; group: string }[] = [
  { key: "editPanelEase", label: "ease", group: "MixerBar panel (open/close/resize)" },
  { key: "rollEase", label: "ease", group: "RollingLabel roll (MatchSelector/LevelSelector/SortSelect)" },
  { key: "cardEaseOut", label: "ease (enter)", group: "Result card enter/exit" },
  { key: "cardEaseIn", label: "ease (exit)", group: "Result card enter/exit" },
];

const GROUP_ORDER = ["MixerBar panel (open/close/resize)", "RollingLabel roll (MatchSelector/LevelSelector/SortSelect)", "Result card enter/exit"];

// Live drag-jitter isolation toggles. Each flips a data-* attribute on <html>
// imperatively (no React re-render, no rebuild); matching CSS in globals.css
// removes one result-card compositor layer while it's on. Goal: with cards
// present, drag the MixerBar on-device and flip these one at a time to find
// which layer(s) kill the jitter. In-memory only, inert when all are off.
const DEBUG_TOGGLES: { attr: string; label: string }[] = [
  { attr: "data-debug-no-card-filters", label: "no card filters (blur/contrast)" },
  { attr: "data-debug-no-card-shadows", label: "no card shadows" },
  { attr: "data-debug-flat-cards", label: "flat cards (no 3D/perspective)" },
  { attr: "data-debug-no-back-fill", label: "no back-fill blur" },
  { attr: "data-debug-hide-cards", label: "hide results (baseline)" },
  // Structural / scroll-layer probes (Cause B — decoration already ruled out)
  { attr: "data-debug-no-carousel-scroll", label: "no carousel scroll" },
  { attr: "data-debug-no-tag-scroll", label: "no card tag scroll" },
  { attr: "data-debug-no-desc-scroll", label: "no card desc scroll" },
  { attr: "data-debug-contain-cards", label: "contain cards (content-visibility)" },
  // Suppress the drag-time card-fx stripping (star pause + reflection hide) so
  // cards render fully while comparing the resize prototypes. Read in JS by
  // MixerBar's handleResizeStart, not via a CSS rule.
  { attr: "data-debug-keep-card-fx", label: "keep card fx during drag" },
];

export function AnimationDebugPanel() {
  const values = useAnimationDebugValues();
  // Starts collapsed to a single toggle button — a fixed panel this dense,
  // left permanently expanded, would sit on top of Masthead's own theme
  // swatches at the same top-right corner otherwise. Local state, not the
  // shared store: whether the panel itself is open/closed is purely this
  // component's own UI state, unrelated to the animation VALUES the store
  // holds.
  const [open, setOpen] = useState(false);
  // Which live diagnostic toggles are on. Local (in-memory) — mirrors the
  // data-* attributes set imperatively on <html> below, only so the
  // checkboxes render their own state; the cards themselves react purely via
  // CSS, so flipping one never re-renders the results.
  // Resize-mode prototype selector. "auto" clears data-resize-mode so MixerBar
  // picks its platform default; the other buttons force a specific path.
  const [resizeMode, setResizeModeState] = useState<"auto" | "real" | "ghost" | "scale">("auto");
  function setResizeMode(mode: "auto" | "real" | "ghost" | "scale") {
    setResizeModeState(mode);
    if (mode === "auto") document.documentElement.removeAttribute("data-resize-mode");
    else document.documentElement.setAttribute("data-resize-mode", mode);
  }
  const [debugFlags, setDebugFlags] = useState<Record<string, boolean>>({});
  function toggleDebug(attr: string) {
    setDebugFlags((prev) => {
      const next = !prev[attr];
      if (next) document.documentElement.setAttribute(attr, "true");
      else document.documentElement.removeAttribute(attr);
      return { ...prev, [attr]: next };
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-[var(--space-lg)] right-[var(--space-lg)] z-[var(--z-popover)] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] px-[var(--space-md)] py-[var(--space-sm)] font-mono text-[length:var(--text-2xs)] font-bold uppercase tracking-[var(--tracking-sm)] text-[var(--ink)] shadow-[var(--elev-2)] cursor-pointer"
      >
        anim debug
      </button>
    );
  }

  return (
    <div className="fixed top-[var(--space-lg)] right-[var(--space-lg)] z-[var(--z-popover)] max-h-[calc(100vh-var(--space-2xl))] w-[280px] overflow-y-auto border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] font-mono text-[length:var(--text-2xs)] text-[var(--ink)] shadow-[var(--elev-4)]">
      <div className="sticky top-0 flex items-center justify-between gap-[var(--space-sm)] border-b-[length:var(--border-thin)] border-[var(--ink)] bg-[var(--surface)] px-[var(--space-md)] py-[var(--space-sm)]">
        <span className="font-bold uppercase tracking-[var(--tracking-sm)]">anim debug</span>
        <div className="flex items-center gap-[var(--space-sm)]">
          <button
            type="button"
            onClick={() => resetAnimationDebugValues()}
            className="cursor-pointer border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-sm)] py-[2px] uppercase tracking-[var(--tracking-sm)] hover:bg-[var(--fill)]"
          >
            reset
          </button>
          <button type="button" onClick={() => setOpen(false)} className="cursor-pointer px-[var(--space-xs)]" aria-label="Close animation debug panel">
            ✕
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-[var(--space-lg)] p-[var(--space-md)]">
        {GROUP_ORDER.map((group) => (
          <div key={group} className="flex flex-col gap-[var(--space-sm)]">
            <div className="text-[length:var(--text-3xs)] font-bold uppercase tracking-[var(--tracking-sm)] text-[var(--subtext)]">{group}</div>
            {NUMBER_FIELDS.filter((f) => f.group === group).map((f) => (
              <label key={f.key} className="flex flex-col gap-[2px]">
                <span className="flex items-center justify-between">
                  <span>{f.label}</span>
                  <span className="tabular-nums">{values[f.key] as number}</span>
                </span>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={values[f.key] as number}
                  onChange={(e) => setAnimationDebugValue(f.key, Number(e.target.value) as AnimationDebugValues[typeof f.key])}
                  className="w-full cursor-pointer"
                />
              </label>
            ))}
            {EASE_FIELDS.filter((f) => f.group === group).map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-[var(--space-sm)]">
                <span>{f.label}</span>
                <select
                  value={values[f.key] as NamedEase}
                  onChange={(e) => setAnimationDebugValue(f.key, e.target.value as AnimationDebugValues[typeof f.key])}
                  className="border-[length:var(--border-thin)] border-[var(--ink)] bg-[var(--surface)] px-[var(--space-xs)] py-[2px] font-mono text-[length:var(--text-3xs)] text-[var(--ink)]"
                >
                  {NAMED_EASES.map((ease) => (
                    <option key={ease} value={ease}>
                      {ease}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ))}
        {/* Live drag-jitter isolation — see DEBUG_TOGGLES. Each checkbox
            flips a data-* attribute on <html> imperatively; the cards react
            via CSS only, so toggling is instant and never re-renders them. */}
        <div className="flex flex-col gap-[var(--space-sm)] border-t-[length:var(--border-thin)] border-[var(--ink)] pt-[var(--space-sm)]">
          <div className="text-[length:var(--text-3xs)] font-bold uppercase tracking-[var(--tracking-sm)] text-[var(--subtext)]">
            resize mode (prototype)
          </div>
          <div className="flex gap-[var(--space-xs)]">
            {(["auto", "real", "ghost", "scale"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setResizeMode(mode)}
                className={[
                  "flex-1 cursor-pointer border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-xs)] py-[2px] uppercase tracking-[var(--tracking-sm)]",
                  resizeMode === mode ? "bg-[var(--ink)] text-[var(--surface)]" : "hover:bg-[var(--fill)]",
                ].join(" ")}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="text-[length:var(--text-3xs)] font-bold uppercase tracking-[var(--tracking-sm)] text-[var(--subtext)] pt-[var(--space-xs)]">
            drag jitter diagnostics (live)
          </div>
          {DEBUG_TOGGLES.map((tgl) => (
            <label key={tgl.attr} className="flex items-center gap-[var(--space-sm)] cursor-pointer">
              <input type="checkbox" checked={!!debugFlags[tgl.attr]} onChange={() => toggleDebug(tgl.attr)} className="cursor-pointer" />
              <span>{tgl.label}</span>
            </label>
          ))}
        </div>
        {/* Defaults reference, not another control — lets a reset be judged
            against the exact numbers it's resetting TO without leaving this
            panel. */}
        <div className="border-t-[length:var(--border-thin)] border-[var(--ink)] pt-[var(--space-sm)] text-[length:var(--text-3xs)] text-[var(--subtext)]">
          defaults: {ANIMATION_DEBUG_DEFAULTS.editPanelTransitionMs}ms / {ANIMATION_DEBUG_DEFAULTS.rollDurationMs}ms / {ANIMATION_DEBUG_DEFAULTS.cardDurationMs}ms
        </div>
      </div>
    </div>
  );
}
