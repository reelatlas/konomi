"use client";

import { useEffect, useRef, useState } from "react";
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
  // The pace rule, surfaced directly: ms shaved off the stagger per card
  // fewer than 5 sweeping. 10 = shipped feel, 0 = flat stagger everywhere.
  { key: "staggerStepMs", label: "stagger step (ms per card fewer)", min: 0, max: 100, step: 5, group: "Result card enter/exit" },
  { key: "slideDurationMs", label: "duration (ms, on recommend)", min: 0, max: 2000, step: 10, group: "Result card slide (locks/repeats reorder)" },
  // The post-Clear-✕ compaction runs SEQUENTIALLY after the exit sweep, in
  // isolation, so the same duration reads slower there — hence its own knob.
  { key: "clearSlideDurationMs", label: "duration (ms, after Clear ✕)", min: 0, max: 2000, step: 10, group: "Result card slide (locks/repeats reorder)" },
  // Empty-state box, per direction. The offset sliders ARE the Y-position
  // knobs: ENTER's offset is where the box STARTS relative to its resting
  // spot (+ = that many px below, rising up into place; − = above,
  // dropping down); EXIT's is where its travel ENDS (+ = rises up that far,
  // − = sinks down) — an exit always STARTS at rest by definition, since
  // the box is sitting in place before the RECOMMEND. Delay pushes a
  // direction's start past the card sweep's opening beat.
  { key: "emptyEnterDurationMs", label: "duration (ms)", min: 0, max: 2000, step: 10, group: "Empty-state box enter (after Clear ✕)" },
  { key: "emptyEnterDistancePx", label: "start offset Y (px, + below / − above)", min: -240, max: 240, step: 2, group: "Empty-state box enter (after Clear ✕)" },
  { key: "emptyEnterDelayMs", label: "start delay (ms)", min: 0, max: 1000, step: 10, group: "Empty-state box enter (after Clear ✕)" },
  { key: "emptyExitDurationMs", label: "duration (ms)", min: 0, max: 2000, step: 10, group: "Empty-state box exit (on recommend)" },
  { key: "emptyExitDistancePx", label: "end offset Y (px, + up / − down)", min: -240, max: 240, step: 2, group: "Empty-state box exit (on recommend)" },
  { key: "emptyExitDelayMs", label: "start delay (ms)", min: 0, max: 1000, step: 10, group: "Empty-state box exit (on recommend)" },
];

const EASE_FIELDS: { key: keyof AnimationDebugValues; label: string; group: string }[] = [
  { key: "editPanelEase", label: "ease", group: "MixerBar panel (open/close/resize)" },
  { key: "rollEase", label: "ease", group: "RollingLabel roll (MatchSelector/LevelSelector/SortSelect)" },
  { key: "cardEaseOut", label: "ease (enter)", group: "Result card enter/exit" },
  { key: "cardEaseIn", label: "ease (exit)", group: "Result card enter/exit" },
  { key: "slideEase", label: "ease", group: "Result card slide (locks/repeats reorder)" },
  { key: "emptyEnterEase", label: "ease", group: "Empty-state box enter (after Clear ✕)" },
  { key: "emptyExitEase", label: "ease", group: "Empty-state box exit (on recommend)" },
];

const GROUP_ORDER = [
  "MixerBar panel (open/close/resize)",
  "RollingLabel roll (MatchSelector/LevelSelector/SortSelect)",
  "Result card enter/exit",
  "Result card slide (locks/repeats reorder)",
  "Empty-state box enter (after Clear ✕)",
  "Empty-state box exit (on recommend)",
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
  // Tuning-loop conveniences (debug tool only, deliberately crude):
  // click-anywhere-outside closes the panel (so a tweak can flow straight
  // into clicking RECOMMEND/Clear ✕ without hunting the tiny ✕ first) —
  // toggleable via the checkbox in the body, for sessions where the panel
  // should stay put while poking the app — and the header is a horizontal
  // drag handle (top-aligned, X offset only) so the panel can be pulled
  // clear of whatever it's covering. The collapsed toggle button shares
  // dragX, so closing doesn't snap the control back to the top-right.
  const panelRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [closeOnOutside, setCloseOnOutside] = useState(true);
  useEffect(() => {
    if (!open || !closeOnOutside) return;
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, closeOnOutside]);
  const onHeaderPointerDown = (e: React.PointerEvent) => {
    // The header's own buttons (reset / ✕) stay clicks, not drag starts.
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startX = e.clientX;
    const baseX = dragX;
    const onMove = (ev: PointerEvent) => setDragX(baseX + (ev.clientX - startX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Shares the panel's dragX so the collapsed button rests wherever
        // the panel was dragged, instead of snapping back to the top-right.
        style={{ transform: `translateX(${dragX}px)` }}
        className="fixed top-[var(--space-lg)] right-[var(--space-lg)] z-[var(--z-popover)] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] px-[var(--space-md)] py-[var(--space-sm)] font-mono text-[length:var(--text-2xs)] font-bold uppercase tracking-[var(--tracking-sm)] text-[var(--ink)] shadow-[var(--elev-2)] cursor-pointer"
      >
        anim debug
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{ transform: `translateX(${dragX}px)` }}
      className="fixed top-[var(--space-lg)] right-[var(--space-lg)] z-[var(--z-popover)] max-h-[calc(100vh-var(--space-2xl))] w-[280px] overflow-y-auto border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] font-mono text-[length:var(--text-2xs)] text-[var(--ink)] shadow-[var(--elev-4)]"
    >
      <div
        onPointerDown={onHeaderPointerDown}
        className="sticky top-0 flex items-center justify-between gap-[var(--space-sm)] border-b-[length:var(--border-thin)] border-[var(--ink)] bg-[var(--surface)] px-[var(--space-md)] py-[var(--space-sm)] cursor-grab select-none touch-none"
      >
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
        {/* Panel behavior, not an animation value — deliberately NOT in the
            store (resetting animation values shouldn't touch it). */}
        <label className="flex items-center justify-between gap-[var(--space-sm)] cursor-pointer text-[var(--subtext)]">
          <span>close on outside click</span>
          <input
            type="checkbox"
            checked={closeOnOutside}
            onChange={(e) => setCloseOnOutside(e.target.checked)}
            className="cursor-pointer"
          />
        </label>
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
