"use client";

import { useEffect, useRef, useState } from "react";
import type { TagInfo } from "@/lib/konomi/types";
import { ArrowDownIcon, ArrowUpHalfIcon, ArrowUpIcon, CloseIcon, GripIcon } from "./icons";
import { IconButton } from "./IconButton";
import { TagPoolBody } from "./TagPoolBody";
import {
  clampPoolPanelHeight,
  POOL_HEIGHT_MIN,
  setPoolPanelHeightFraction,
  usePoolPanelHeightFraction,
} from "./tagPoolPrefs";

// ---- Tag pool overlay (search v2, Phase 2) ----
//
// The pool panel's new home: a floating card anchored under the persistent
// results header, OVERLAYING the card area — it pushes no layout and can
// never overlap the mixbar, by construction: this component's sizing shell
// is absolutely positioned inside the card-area wrapper (KonomiApp), whose
// bottom edge is the results section's own bottom, 24px above the mixbar.
// That geometry replaces the entire expand-upward machinery MixerBar
// carried (pin loops, clip-path reveal, worst-case overhead math, scroll
// locks) — opening/resizing an overlay changes nothing in layout, so none
// of it is needed. MixerBar's own panel is inert as of Phase 2 (its
// editMode prop is passed false; Phase 3 deletes the dead machinery).
//
// Floating-gap look (user-ruled over attached-to-header): the shell's top
// is the card area's top, which already sits one header-margin (space-lg)
// below the header row — the gap IS that existing rhythm, no new offset.
//
// Enter animation: ladder rung 2 — a one-shot CSS keyframe on mount
// (globals.css .animate-tagpool-overlay-enter); exit is instant unmount
// (dropdown convention). No Motion: nothing here is interruptible or
// gesture-driven, and the resize drag is direct manipulation (height
// tracks the pointer), not animated motion.
//
// data-tagpool-overlay (on the card): read by KonomiApp's masthead
// wheel/touch scrub effect to keep gestures over the open panel from
// scrubbing the masthead morph behind it.

// Vertical chrome between the card's outer height and TagPoolBody's own
// budget (poolPanelHeightPx): py-[--space-xl] top+bottom (2 × 16) + the
// bottom grip row's fixed height (GRIP_ROW_PX). TagPoolBody subtracts its
// own live-measured tab rows from the budget itself (see its
// poolPanelHeightPx prop comment) — this constant only covers what THIS
// component adds around it. If the card's padding or the grip row change,
// re-derive.
const GRIP_ROW_PX = 18;
const CARD_PAD_Y_PX = 32;
const OVERLAY_CHROME_PX = CARD_PAD_Y_PX + GRIP_ROW_PX;

interface TagPoolOverlayProps {
  open: boolean;
  onClose: () => void;
  allTags: TagInfo[];
  selectedTagIds: string[];
  totalSeriesCount: number;
  onChipToggle: (tagId: string) => void;
}

export function TagPoolOverlay({ open, onClose, allTags, selectedTagIds, totalSeriesCount, onChipToggle }: TagPoolOverlayProps) {
  // The sizing shell measures the card area (the height ceiling) — the
  // shell itself is inset-0 in the wrapper, so its own height IS the
  // ceiling; no cross-component measuring or prop threading needed.
  const shellRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [ceiling, setCeiling] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => {
      setCeiling(entry.contentRect.height);
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, [open]);

  // Height model: the SAME persisted fraction-of-ceiling pref the mixbar
  // panel used (tagPoolPrefs) — a user's chosen proportion carries over
  // to the new home; the ceiling it's a fraction OF is just the card area
  // now instead of the mixbar's computed max. Default (never dragged) =
  // POOL_HEIGHT_MIN, the same "opens at its floor, expand if you want
  // more" seed as before. During a drag, dragHeightPx tracks the pointer
  // directly (rAF-throttled state — the overlay pushes no layout, so real
  // geometry is cheap; no pinning/clip-path needed, the exact machinery
  // this relocation retires).
  const storedFraction = usePoolPanelHeightFraction();
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  const effectiveCeiling = ceiling ?? POOL_HEIGHT_MIN;
  const restHeightPx = clampPoolPanelHeight(
    storedFraction !== null ? storedFraction * effectiveCeiling : POOL_HEIGHT_MIN,
    effectiveCeiling,
  );
  const heightPx = dragHeightPx !== null ? dragHeightPx : restHeightPx;
  const isGripDragging = dragHeightPx !== null;

  // Bottom-edge drag-to-resize: down = grow (the natural direction for a
  // top-anchored dropdown — the handle flip from the mixbar era's
  // top-edge drag, user-approved). Listeners on window, not the grip —
  // the grip can unmount mid-drag (Esc closes the panel), and orphaned
  // element listeners were a real, confirmed bug class in the mixbar era
  // (see MixerBar's resize comment); window always receives the
  // pointerup. pointercancel ends the drag like a release.
  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = heightPx;
    const max = effectiveCeiling;
    let raf = 0;
    let latest = startH;
    const move = (ev: PointerEvent) => {
      latest = clampPoolPanelHeight(startH + (ev.clientY - startY), max);
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          setDragHeightPx(latest);
        });
      }
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (raf) cancelAnimationFrame(raf);
      // Persist BEFORE clearing the drag state — both land in one React
      // batch, so the rest height derived from the new fraction replaces
      // the drag height with no intermediate frame at the old value.
      setPoolPanelHeightFraction(latest / max);
      setDragHeightPx(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    setDragHeightPx(startH);
  }

  // Snap cycle — the mixbar cluster's own 3-state semantics, kept: below
  // 50% shows the half-arrow (→ 50%), between shows the full-arrow
  // (→ 100%), at full shows the down-arrow back to the POOL_HEIGHT_MIN
  // default. Snaps just persist the fraction; height derives.
  const isAtFullHeight = heightPx >= effectiveCeiling - 1;
  const isBelowHalfHeight = heightPx < effectiveCeiling * 0.5 - 1;
  const handleSnap = (fraction: number) => setPoolPanelHeightFraction(fraction);
  const handleResetHeight = () => setPoolPanelHeightFraction(POOL_HEIGHT_MIN / effectiveCeiling);

  // Escape (document-level, the app's established contract): a consumed
  // Escape marks itself with preventDefault — the search field's
  // clear-query stage does — and this close only fires for unclaimed
  // ones. stopPropagation can't shield same-node document listeners in
  // this App Router app; see the MixerBar/DESIGN_SYSTEM writeup.
  const onCloseRef = useRef(onClose);
  // Every-render mirror effect (not a render-phase ref write, which the
  // repo's react-hooks/refs rule correctly rejects) — same idiom as
  // MixerBar's onCloseEditModeRef.
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) onCloseRef.current();
    }
    // Click-outside closes — same explicit allowlist philosophy as the
    // mixbar-era listener (each exempt control has its own real action
    // that shouldn't also dismiss the panel as a side effect): result
    // cards, theme swatches, Clear ✕, the Filter popover, the empty-state
    // controls, the header's global-search cluster (it COMMANDS this
    // panel), and the whole mixbar (slots/min-match/Random must stay
    // usable against the open pool — dragging chips into slots is the
    // core flow; RECOMMEND closes the panel through its own success path
    // in KonomiApp, not through this listener).
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (cardRef.current?.contains(target)) return;
      const el = target instanceof Element ? target : (target as Node).parentElement;
      if (
        el?.closest(
          "[data-result-card], [data-theme-switcher], [data-clear-results], [data-results-filter], [data-empty-controls], [data-global-search], [data-mixer-bar]",
        )
      )
        return;
      onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  // Dialog focus management — the two-sided contract established in
  // Phase 1: when the opener is the global search FIELD, the field keeps
  // focus (its keystrokes are the interaction; the panel is a display
  // surface) and there is nothing to restore on close. Any other opener
  // (Tag Pool buttons) gets the normal treatment: focus moves into the
  // dialog on open, back to the opener on close. preventScroll for the
  // same never-jump reason as the mixbar era. Runs on mount/unmount —
  // the overlay only mounts while open.
  const previouslyFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const current = document.activeElement as HTMLElement | null;
    if (current?.matches?.("[data-global-search] input")) {
      previouslyFocused.current = null;
    } else {
      previouslyFocused.current = current;
      cardRef.current?.focus({ preventScroll: true });
    }
    return () => {
      previouslyFocused.current?.focus({ preventScroll: true });
      previouslyFocused.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    // Sizing shell: fills the card area (the wrapper in KonomiApp is
    // relative), measures the ceiling, and paints nothing itself.
    // pointer-events-none so the area below a short panel still reaches
    // the cards/empty box; the card re-enables its own events.
    <div ref={shellRef} className="absolute inset-0 z-[var(--z-overlay)] pointer-events-none">
      <div
        ref={cardRef}
        data-tagpool-overlay
        role="dialog"
        aria-modal="true"
        aria-label="Tag pool"
        tabIndex={-1}
        // Same card chrome as the mixbar (border-base ink border, surface
        // bg, elev-4 shadow, 2xl/xl padding) — the panel moved homes, it
        // didn't change identity.
        className="animate-tagpool-overlay-enter pointer-events-auto flex flex-col outline-none px-[var(--space-2xl)] py-[var(--space-xl)] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-4)]"
        style={{ height: heightPx }}
      >
        <TagPoolBody
          allTags={allTags}
          selectedTagIds={selectedTagIds}
          totalSeriesCount={totalSeriesCount}
          onChipToggle={onChipToggle}
          poolPanelHeightPx={Math.max(0, heightPx - OVERLAY_CHROME_PX)}
          editMode={open}
          trailingControls={
            <div className="flex items-center gap-0 shrink-0">
              {/* Snap arrows: desktop only, same min-[993px] "is this
                  desktop" line the mixbar cluster used — touch users have
                  the grip itself, full-range and one gesture away. */}
              <div className="hidden min-[993px]:flex items-center gap-0">
                {isAtFullHeight ? (
                  <IconButton
                    size="sm"
                    border="none"
                    backgroundColor="transparent"
                    title="Reset pool panel to default height"
                    aria-label="Reset pool panel to default height"
                    onClick={handleResetHeight}
                  >
                    <ArrowDownIcon className="text-[var(--muted)]" />
                  </IconButton>
                ) : isBelowHalfHeight ? (
                  <IconButton
                    size="sm"
                    border="none"
                    backgroundColor="transparent"
                    title="Resize to 50%"
                    aria-label="Resize to 50%"
                    onClick={() => handleSnap(0.5)}
                  >
                    <ArrowUpHalfIcon className="text-[var(--muted)]" />
                  </IconButton>
                ) : (
                  <IconButton
                    size="sm"
                    border="none"
                    backgroundColor="transparent"
                    title="Resize to 100%"
                    aria-label="Resize to 100%"
                    onClick={() => handleSnap(1)}
                  >
                    <ArrowUpIcon className="text-[var(--muted)]" />
                  </IconButton>
                )}
              </div>
              <IconButton size="sm" border="none" backgroundColor="transparent" title="Close" aria-label="Close" onClick={onClose}>
                <CloseIcon className="text-[var(--muted)]" />
              </IconButton>
            </div>
          }
          isPoolPanelResizing={isGripDragging}
        />
        {/* Bottom-edge grip row — the resize handle flipped from the
            mixbar era's top-of-panel position: in a downward dropdown,
            drag-down-to-grow is the natural gesture. mt-auto pins it to
            the card's bottom regardless of content height. Same grab-hand
            cursor pairing as the mixbar grip (open hand at rest, closed
            while dragging, state-driven so they can't desync). */}
        <div className="mt-auto flex items-center justify-center shrink-0" style={{ height: GRIP_ROW_PX }}>
          <IconButton
            size="sm"
            border="none"
            backgroundColor="transparent"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to resize tag pool"
            onPointerDown={handleResizeStart}
            cursor={isGripDragging ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"}
            className="select-none touch-none"
          >
            <GripIcon dragging={isGripDragging} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
