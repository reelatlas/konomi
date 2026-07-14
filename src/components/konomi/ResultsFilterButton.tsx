"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey } from "@/lib/konomi/types";
import { FilterControls } from "./FilterControls";
import { FilterIcon } from "./icons";
import { IconButton } from "./IconButton";

interface ResultsFilterButtonProps {
  // Persisting Level also prunes any selected tag the new level hides —
  // that extra step lives in KonomiApp's handleLevelChange, threaded down
  // through ResultsHeader, the same prop MixerBar used to receive directly
  // before Level/Sort lived here instead. Sort has no such cascade, so
  // setSortPref (tagPoolPrefs.ts) is called directly below, matching
  // MixerBar's own old pattern.
  onLevelChange: (level: LevelKey) => void;
}

// Tag Density (Level) and Sort used to live in MixerBar's own resize-handle
// row. They moved here — a popover off a Filter icon inline with the
// Recommendations header — so MixerBar's edit sheet no longer needs a row
// of its own just for them (see MixerBar.tsx's own top comment). The
// underlying state (useLevel/useSort/setSortPref, tagPoolPrefs.ts) is
// untouched by the move: TagPoolBody and ResultCard keep reading it
// directly and independently, exactly as before.
export function ResultsFilterButton({ onLevelChange }: ResultsFilterButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Closes on any outside pointerdown or Escape — the same two patterns
  // already proven this session for LevelSelector's collapsed hint and
  // MixerBar's own edit-mode dialog, not a new mechanism.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    // data-results-filter: lets MixerBar's own click-outside-closes-edit-mode
    // listener allowlist this trigger and its popover via the same
    // closest() check it already uses for data-clear-results (ResultsHeader's
    // own Clear button) — without it, opening this popover while Tag Pool's
    // edit mode happens to be open would close edit mode as an unrelated
    // side effect, the identical footgun Clear was already protected
    // against for the same reason.
    //
    // This wrapper's own z-index switches between z-raised and z-popover
    // based on `open`, rather than sitting at one fixed value — the
    // *trigger button* should only ever need to outrank the results
    // carousel behind it (z-raised already covers that, the same fix
    // ResultsHeader's Clear ✕ has for the identical reason — see that
    // file's own comment), not MixerBar's own z-overlay edit sheet, which
    // is free to visually cover this closed button like any other content
    // in its path. Only once the *popover* actually opens does this need
    // to outrank MixerBar too, since the sheet can grow tall enough to
    // reach this row. z-popover only applies while `open`, so the closed
    // trigger never claims priority it doesn't need — requested directly,
    // "the button shouldn't outrank the edit panel, just the popover
    // should, if it's open."
    //
    // Bumping the *whole wrapper* (trigger included) rather than just the
    // popover panel below is still required even though only the popover
    // itself needs to visually win — confirmed live: a nested z-index
    // doesn't escape its own ancestor's stacking context, so giving only
    // the inner popover panel a high z-index has no effect on how this
    // whole component stacks against a sibling subtree like MixerBar's
    // cardRef; that comparison is governed entirely by this outer
    // wrapper's own z-index; the trigger button riding along with it while
    // open is a side effect of that, not a separate ask. z-popover (20,
    // globals.css) is deliberately its own token, not a reused z-overlay:
    // two siblings both claiming the same "floating, on top of everything"
    // tier would leave their relative order decided by DOM position
    // rather than an explicit ranking (see globals.css's own comment on
    // this token for why MixerBar's cardRef, later in the DOM, would
    // otherwise silently win by accident).
    <div ref={wrapperRef} data-results-filter className={["relative", open ? "z-[var(--z-popover)]" : "z-[var(--z-raised)]"].join(" ")}>
      {/* Colour matches the results-header metadata scheme (requested): a
          CLOSED (inactive) filter is --muted — the app's inactive-tab colour,
          the same one the metadata's 0-count readouts use — outlined with a
          transparent fill; an OPEN ("engaged") filter is filled --primary with a
          --surface icon, i.e. the SAME "engaged filter bg" the Level/Sort
          segmented controls give their selected option (LevelSelector). It
          reverts the instant `open` goes false (trigger click, outside click, or
          Escape all flip this one state). glow-host + a glow-icon on FilterIcon
          add the shared hover/focus bloom (globals.css) — the same --subtext
          glow the MixerBar drag grip and the metadata lock use — so hovering
          signals it's clickable. borderColor/backgroundColor are IconButton's
          own props; every other icon button keeps IconButton's --ink default. */}
      <IconButton
        size="sm"
        border="base"
        borderColor={open ? "var(--primary)" : "var(--muted)"}
        backgroundColor={open ? "var(--primary)" : "transparent"}
        title="filters"
        aria-label="filters"
        aria-pressed={open}
        onClick={() => setOpen((o) => !o)}
        className="glow-host"
      >
        <FilterIcon className={`glow-icon ${open ? "text-[var(--surface)]" : "text-[var(--muted)]"}`} />
      </IconButton>
      {open && (
        <div
          role="dialog"
          aria-label="filters"
          // @container: Level/Sort's own label-hide/collapse breakpoints
          // below key off this container's width, not the old MixerBar
          // cardRef's — the old @min-[480px]/@max-[352px] numbers were
          // calibrated against that much wider box and can't be reused
          // here (this popover is always far narrower), see this file's
          // own git history/DESIGN_SYSTEM.md for the live-bisected values
          // actually used.
          //
          // w-max (max-content) + max-w-[min(340px,calc(100vw-6rem))]: the dialog
          // HUGS its filters rather than stretching to a fixed width — otherwise,
          // right-aligned content in a wide box left a big empty gap on the left
          // at small widths (reported). FilterControls' popover layout is a
          // flex-COL (two fixed rows — Density above Sort), so its max-content
          // width is simply its WIDEST row, which is exactly what the dialog
          // should hug — and w-max reads that with no JS measurement. (w-fit would
          // collapse to min-content here, since this dialog is position:absolute
          // and fit-content resolves against its ~30px trigger wrapper; and
          // max-content only equals the widest row because the layout is a column
          // — a flex-row's would be both fields on one line.) Hugging is only
          // possible because that popover layout reduces off the VIEWPORT (plain
          // media queries), NOT a @container: a container-type box ignores its own
          // content for sizing, so a content-sized container query would collapse
          // to zero — mutually exclusive (which is why this used to be a fixed
          // w-[…]).
          //
          // The max-width's viewport term is 6rem, not the 3rem for the two page
          // gutters alone: this dialog is absolute right-0 against the FILTER
          // button, which sits LEFT of the Clear ✕ (not at the content column's
          // right edge), so it opens leftward from a point already inset ~66px
          // from the viewport's right (Clear button + gap + right gutter). At
          // 3rem the leftward extent ran it off the left edge of the screen on
          // phones (left edge −18px at 320–375px wide); 6rem (~96px) reserves
          // that inset plus the left gutter, keeping the dialog fully on-screen
          // while leaving the 340px cap untouched above ~436px. A coupled
          // constant tied to the Clear ✕ width — re-derive if that changes.
          //
          // No z-index needed here — the wrapper above already carries
          // z-popover for the whole time this panel exists (it only
          // renders while `open`), and position:absolute alone already
          // paints this above its own static-positioned trigger-button
          // sibling within that same local context.
          className="absolute right-0 top-full mt-[var(--space-sm)] w-max max-w-[min(340px,calc(100vw-6rem))] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-2)] p-[var(--space-lg)]"
        >
          <FilterControls onLevelChange={onLevelChange} />
        </div>
      )}
    </div>
  );
}
