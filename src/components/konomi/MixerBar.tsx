"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey, MatchKey, MixerError, Slot, TagInfo } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { GreaterEqualIcon, SortIcon, TagIcon } from "./icons";
import { LevelSelector } from "./LevelSelector";
import { MatchSelector } from "./MatchSelector";
import { RecommendButton } from "./RecommendButton";
import { SortSelect } from "./SortSelect";
import { clampPoolPanelHeight, setPoolPanelHeightPref, setSortPref, useLevel, usePoolPanelHeight, useSort } from "./tagPoolPrefs";
import { TagPoolBody } from "./TagPoolBody";
import { TagSlot } from "./TagSlot";

interface MixerBarProps {
  slots: Slot[];
  dragOverIndex: number;
  minMatch: MatchKey;
  lockedLabel: string;
  filledCount: number;
  onSlotDragOver: (index: number) => void;
  onSlotDragLeave: () => void;
  onSlotDrop: (index: number, tag: string) => void;
  onSlotClick: (index: number) => void;
  onSetMatch: (key: MatchKey) => void;
  onRandomTags: () => void;
  onClearSlots: () => void;
  onRecommend: () => void;
  error: MixerError;
  editMode: boolean;
  onOpenEditMode: () => void;
  onCloseEditMode: () => void;
  allTags: TagInfo[];
  selectedTags: string[];
  totalSeriesCount: number;
  onLevelChange: (level: LevelKey) => void;
  onChipToggle: (tag: string) => void;
}

// Formerly MixerSection — now the app's one bottom-anchored bar, always
// present in a compact "browse" form (title/badge, slots, controls) that
// expands in place into a taller "edit" form (same title row relabeled,
// same slots pinned at the top, a pool panel appearing between slots and
// controls, controls row gaining a Done button) instead of a second overlay
// replacing it. See DESIGN_SYSTEM.md's "Super-mixer edit mode" section for
// the full rationale — this comment covers only the mechanics.
//
// `@container` moves to an inner wrapper (not the fixed root) deliberately:
// once the root is `position:fixed inset-x-0`, its own inline-size becomes
// the raw viewport width, which would silently shift the `@min-[480px]`
// breakpoint below relative to what it measured back when this box was
// laid out in-flow inside the page's own max-w-[1280px] wrapper. Keeping
// that same max-w/mx-auto/px treatment on the inner @container element
// keeps the breakpoint meaning what it always has.
//
// The pool panel (Level/Sort + TagPoolBody, which itself owns
// SectionTabStrip + the chip area) is always mounted, never conditionally
// rendered — toggled via max-h-0 overflow-hidden keyed off `editMode`, the
// same trick the retired TagPoolRecommendationsPanel used for tab-
// switching, generalized from two tab keys to one boolean. This is
// required, not stylistic: TagPoolBody's own activeSectionKey state and
// every ScrollFadeArea scroll position inside it have no persistence
// outside the live DOM, so unmounting this subtree on every close would
// reset both every time — see TagPoolBody.tsx's own top comment, unchanged
// from before, for why it already relies on exactly this guarantee.
export function MixerBar({
  slots,
  dragOverIndex,
  minMatch,
  lockedLabel,
  filledCount,
  onSlotDragOver,
  onSlotDragLeave,
  onSlotDrop,
  onSlotClick,
  onSetMatch,
  onRandomTags,
  onClearSlots,
  onRecommend,
  error,
  editMode,
  onOpenEditMode,
  onCloseEditMode,
  allTags,
  selectedTags,
  totalSeriesCount,
  onLevelChange,
  onChipToggle,
}: MixerBarProps) {
  // Read-path/write-path for level intentionally differ: read live via
  // useLevel() here (matching how RecommendationsBody/TagPoolBody already
  // read tagPoolPrefs directly rather than via prop), but the *setter*
  // still has to reach back into KonomiApp's pruneTags cascade, so that
  // direction stays a prop. Not an inconsistency — two different concerns.
  const level = useLevel();
  const sort = useSort();

  // Tapping an empty slot opens edit mode instead of the no-op CLEAR_SLOT
  // dispatch it used to trigger; a filled slot still clears as before. This
  // decision has to live here (not in TagSlot or the reducer) since "open
  // edit mode" is UI state the reducer deliberately doesn't own.
  function handleSlotClick(index: number) {
    if (slots[index]) {
      onSlotClick(index);
    } else {
      onOpenEditMode();
    }
  }

  const barRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Desktop-only close behaviors. Doesn't gate on pointer/viewport type —
  // Esc and a genuine "click outside" simply don't occur during normal
  // touch use, so no explicit device check is needed to make this
  // effectively desktop-only in practice. A ref for the close callback
  // (not a dependency) keeps this from re-subscribing on every MixerBar
  // re-render — with slots/dragOverIndex among the props, that would mean
  // every dragover tick while dragging a chip, not just real edit-mode
  // toggles.
  const onCloseEditModeRef = useRef(onCloseEditMode);
  useEffect(() => {
    onCloseEditModeRef.current = onCloseEditMode;
  });

  useEffect(() => {
    if (!editMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseEditModeRef.current();
    }
    function handlePointerDown(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onCloseEditModeRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [editMode]);

  // Visually modal, not behaviorally trapped (no Tab-cycle constraint) —
  // an accepted v1 gap, see DESIGN_SYSTEM.md. This still moves focus in on
  // open and back to whatever triggered it on close, which is the cheap,
  // uncontroversial half of dialog focus management.
  useEffect(() => {
    if (editMode) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      dialogRef.current?.focus();
    } else {
      previouslyFocused.current?.focus();
    }
  }, [editMode]);

  // Desktop drag-resize for the pool panel — see tagPoolPrefs.ts for the
  // persistence/clamping half of this. `dragHeightPx` is live-drag-only
  // (component state, not persisted) so the panel tracks the pointer
  // smoothly; the committed value is written to localStorage once on
  // release, not on every mousemove.
  const persistedHeightPx = usePoolPanelHeight();
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  const effectiveHeightPx = dragHeightPx ?? persistedHeightPx ?? undefined;

  function handleResizeStart(e: React.MouseEvent) {
    // No persisted/in-progress height yet (never dragged this session) —
    // seed the drag from the CSS default's live rendered size, since a
    // delta-based drag needs a real starting number even when the panel is
    // currently sized by a Tailwind class, not a style. window.innerHeight
    // at drag-start, not a stored constant: 50dvh is viewport-relative, so
    // its px equivalent only means anything computed fresh, live.
    const startHeight = effectiveHeightPx ?? window.innerHeight * 0.5;
    const startY = e.clientY;
    const liveHeightRef = { current: startHeight };
    function handleMouseMove(ev: MouseEvent) {
      // Dragging up (mouse Y decreases) grows the panel — matches the
      // physical "pull the sheet's ceiling up to make it taller" model.
      const delta = startY - ev.clientY;
      const next = clampPoolPanelHeight(startHeight + delta);
      liveHeightRef.current = next;
      setDragHeightPx(next);
    }
    function handleMouseUp() {
      setPoolPanelHeightPref(liveHeightRef.current);
      setDragHeightPx(null);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    // max-h-[100dvh] overflow-y-auto: a safety net, not a fitted design —
    // on a very short viewport, letting the whole bar grow to full-viewport
    // height (rather than trying to perfectly ration space between the
    // pinned slots and the pool panel) is an accepted v1 compromise. This
    // just guarantees the bar's own top content is reachable via internal
    // scroll instead of silently rendering above y=0 and becoming
    // inaccessible, since fixed-position elements don't scroll with the
    // page behind them. Mobile feel gets refined in a later pass.
    <div
      ref={barRef}
      className="fixed inset-x-0 bottom-0 z-[var(--z-overlay)] max-h-[100dvh] overflow-y-auto border-t-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)]"
    >
      <div className="@container max-w-[1280px] mx-auto px-[var(--space-2xl)] py-[var(--space-xl)]">
        {/* Row 1: title (mode-dependent) + filled-count badge, same shape
            the old Mixer section title row used. */}
        <div className="flex items-end justify-between mb-[var(--space-lg)]">
          <div className="flex items-center gap-[var(--space-md)]">
            <h2 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]">
              {editMode ? "Edit Tags" : "Mixer"}
            </h2>
            <span className="font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)]">
              {editMode ? "タグ編集" : "ミックス"}
            </span>
          </div>
          <span
            className={[
              "font-mono font-bold text-[length:var(--text-sm)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-xs)]",
              filledCount === 0 ? "bg-[var(--slot-empty)] text-[var(--disabled-text)]" : "bg-[var(--fill)] text-[var(--ink)]",
            ].join(" ")}
          >
            {lockedLabel}
          </span>
        </div>

        {/* Row 2: the 3 tag slots — always rendered, always the first
            content row, which is what "pins near the top of the edit
            surface" means: it's already at the top before the pool panel
            below ever appears. */}
        <div className="flex gap-[var(--space-lg)] mb-[var(--space-lg)]">
          {slots.map((tag, index) => (
            <TagSlot
              key={index}
              index={index}
              tag={tag}
              isDragOver={dragOverIndex === index}
              onDragOver={onSlotDragOver}
              onDragLeave={onSlotDragLeave}
              onDrop={onSlotDrop}
              onClick={handleSlotClick}
            />
          ))}
        </div>

        {/* Row 3: the pool panel — always mounted (see file-top comment),
            capped at 50dvh (dvh not vh: this app's first viewport-height
            usage, chosen specifically to avoid the well-known mobile
            Safari/Chrome dynamic-toolbar jump vh produces) when open. Not a
            hard guarantee on short viewports — see the outer max-h-[100dvh]
            comment above. */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Edit tags"
          tabIndex={-1}
          className={editMode ? "flex flex-col mb-[var(--space-lg)] outline-none" : "max-h-0 overflow-hidden"}
        >
          {/* Desktop-only (hidden below the same 993px tier the row-4
              divider uses) drag handle for the pool panel's height —
              pointer/mouse-only, no touch handlers, no keyboard
              equivalent; mobile keeps the plain 50dvh cap. Sits above the
              Level/Sort row specifically: the slots row above it and the
              controls row below the pool panel are both fixed in height,
              so this is the one boundary that actually determines how
              tall the whole bar grows. */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to resize tag pool"
            onMouseDown={handleResizeStart}
            className="hidden min-[993px]:flex items-center justify-center h-[14px] mb-[var(--space-sm)] cursor-ns-resize select-none"
          >
            <div className="w-[48px] h-[length:var(--border-thin)] bg-[var(--muted)]" />
          </div>
          <div className="flex items-center gap-[var(--space-lg)] flex-wrap mb-[var(--space-md)]">
            <div className="flex items-center gap-[var(--space-sm)]">
              <TagIcon className="text-[var(--ink)]" />
              <LevelSelector value={level} onChange={onLevelChange} />
            </div>
            <div className="flex items-center gap-[var(--space-sm)]">
              <SortIcon className="text-[var(--ink)]" />
              <SortSelect value={sort} onChange={setSortPref} />
            </div>
          </div>
          <TagPoolBody
            allTags={allTags}
            selectedTags={selectedTags}
            totalSeriesCount={totalSeriesCount}
            level={level}
            onChipToggle={onChipToggle}
            chipAreaHeightPx={effectiveHeightPx}
          />
        </div>

        {/* Row 4: MIN TAG MATCH, Random/Clear, Recommend — unchanged from
            the old Mixer controls row, plus Done (edit mode only). */}
        <div className="flex flex-wrap items-center gap-x-[var(--space-lg)] gap-y-[var(--space-lg)]">
          <div className="flex items-center gap-[var(--space-sm)]">
            <span className="hidden @min-[480px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
              Min Tag Match
            </span>
            <TagIcon className="text-[var(--ink)]" />
            <GreaterEqualIcon className="text-[var(--ink)]" />
            <MatchSelector value={minMatch} onChange={onSetMatch} />
          </div>
          <div className="ml-auto flex items-center gap-[var(--space-lg)]">
            <ActionButton variant="filled" onClick={onRandomTags}>
              Random ×3
            </ActionButton>
            <ActionButton variant="outline" onClick={onClearSlots}>
              Clear ✕
            </ActionButton>
          </div>
          <div className="hidden min-[993px]:block ml-[calc(var(--space-xl)_+_2px)] mr-[var(--space-xl)] w-[length:var(--border-thin)] h-[32px] bg-[var(--ink)]" />
          <div className="min-[686px]:max-[993px]:ml-[var(--space-lg)] max-[674px]:ml-auto">
            <RecommendButton filledCount={filledCount} onRecommend={onRecommend} error={error} />
          </div>
          {editMode && (
            <ActionButton variant="outline" onClick={onCloseEditMode}>
              Done ✓
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}
