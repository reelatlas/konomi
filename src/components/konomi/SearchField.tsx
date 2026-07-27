"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "./icons";
import { useTagPoolNav } from "./tagPoolNavContext";

interface SearchFieldProps {
  // The tag pool / edit panel's open state + opener — the field is the
  // panel's primary invoker (search v2): clicking anywhere in the
  // container opens it. Close/toggle stays with the Tag Pool button.
  editMode: boolean;
  onOpenEditMode: () => void;
  // Fires when the field's ENGAGED state (focused or live query) flips —
  // ResultsHeader uses it to hide Tag Pool/Filters while an expanded
  // search needs their room below the header's own collapse rung
  // (interim ruling: overlay-the-neighbors; re-evaluate once felt).
  onEngagedChange?: (engaged: boolean) => void;
}

// THE global search — its own contained component BY RULING (2026-07-27):
// unlike every other header control it's not an ActionButton/IconButton
// variant — a text field with focus/query state machinery is genuinely
// its own kind of thing, so the container + engagement logic live here,
// contained. If search ever scales to other placements, extend THIS
// component (props/variants on it) rather than re-implementing the
// engagement logic elsewhere.
//
// One visual container (a <label>, so clicking anywhere in it natively
// focuses the input) holding the icon INSIDE the box. States mirror the
// header treatment (the Filter button's recipe): REST = flat, transparent
// border+bg, --muted icon and placeholder; HOVER = the shared glow bloom
// (glow-host/glow-icon), rest only; ENGAGED (focus, or a live query) =
// --surface fill + --primary border — the same active border the
// Filter/Tag Pool buttons use, replacing the blue focus ring here BY
// RULING: the input is [outline:none] and the container's primary
// border + fill IS the focus affordance (the documented deviation class
// from the one-focus-regime rule — a control with its own strong,
// deliberate focus treatment; same precedent as the collapsed Min
// Match/Density buttons).
export function SearchField({ editMode, onOpenEditMode, onEngagedChange }: SearchFieldProps) {
  const nav = useTagPoolNav();
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Style-only focus tracking (safe — the focus-opens-panel bug was about
  // OPENING on focus arrivals; this only styles): engaged = focused or a
  // live query, and the hover glow is suppressed while engaged
  // (user-ruled — hovering the icon inside an already-engaged field must
  // not re-trigger the rest-state hover).
  const [searchFocused, setSearchFocused] = useState(false);
  const engaged = searchFocused || nav.query.length > 0;
  useEffect(() => {
    onEngagedChange?.(engaged);
  }, [engaged, onEngagedChange]);
  return (
    <label
      // onMouseDown: when the input is ALREADY focused, a click on the
      // icon/label would blur-then-refocus it — one frame of the
      // container collapsing out of its engaged state and the hover
      // glow re-arming (user-reported). Preventing default keeps
      // focus put; the input never blurs. onClick: clicking the ICON
      // must behave exactly like clicking the field — focus + open
      // the panel (label forwards focus natively, but the panel-open
      // signal lives on the input's own onClick, whose target the
      // icon isn't).
      onMouseDown={(e) => {
        if (document.activeElement === searchInputRef.current) e.preventDefault();
      }}
      onClick={() => {
        searchInputRef.current?.focus();
        if (!editMode) onOpenEditMode();
      }}
      className={[
        "flex items-center shrink-0 cursor-text",
        // glow only at REST — an engaged field doesn't re-advertise
        // its hover affordance (user-ruled).
        engaged ? "" : "glow-host",
        "h-[var(--control-h-md)] w-[min(200px,40vw)] px-[var(--space-lg)] gap-[var(--space-sm)]",
        // HEADER LADDER RUNG H3 (bisected 2026-07-28, see ResultsHeader's
        // ladder comment): below 529 viewport the RESTING field collapses
        // to a magnify icon button (the header icon-twin footprint —
        // fixed control-h-md square, centered icon, gap collapsed so the
        // icon truly centers, pointer cursor since it acts as a button).
        // ENGAGED (focus or query) suppresses every max-[529px] override
        // — clicking the icon focuses the zero-width input (label
        // onClick below), focus flips `engaged`, and the field expands
        // to its normal active form. v4 strict: max-[529px] = <529.
        engaged
          ? ""
          : "max-[529px]:w-[var(--control-h-md)] max-[529px]:px-0 max-[529px]:gap-0 max-[529px]:justify-center max-[529px]:cursor-pointer",
        // borderless rest (border-TRANSPARENT so geometry never
        // shifts); engaged brings the primary frame + surface fill.
        "border-[length:var(--border-base)] transition-colors",
        engaged
          ? "border-[var(--primary)] bg-[var(--surface)]"
          : "border-transparent bg-transparent focus-within:border-[var(--primary)] focus-within:bg-[var(--surface)]",
      ].join(" ")}
    >
      {/* Engaged icon = --primary (user-ruled): the ACTIVE-highlight
          token — the same one the engaged borders/fills use (--accent,
          the renamed secondary, is the selected-slot pop, not the
          active-highlight color). */}
      <SearchIcon className={`glow-icon w-[20px] h-[20px] shrink-0 ${engaged ? "text-[var(--primary)]" : "text-[var(--muted)]"}`} />
      <input
        ref={searchInputRef}
        type="text"
        value={nav.query}
        // Collapsed rest (rung H3): the className below keeps the input
        // zero-WIDTH, not display:none — a display:none input can't
        // receive focus, and focus is exactly how the collapsed icon
        // expands the field (label click → focus() → engaged → the
        // max-[529px] overrides lift).
        onChange={(e) => {
          if (!editMode) onOpenEditMode();
          nav.handleQueryChange(e.target.value);
        }}
        onKeyDown={nav.handleSearchKeyDown}
        // onClick, deliberately NOT onFocus: MixerBar restores focus to
        // the previously-focused element when the panel closes, so an
        // onFocus-opens rule turns every outside-click close into an
        // immediate programmatic re-open (confirmed live — the panel
        // became unclosable). Click + typing are the USER's open
        // signals; programmatic focus arrivals stay inert. The label
        // wrapper forwards its clicks here natively.
        onClick={() => {
          if (!editMode) onOpenEditMode();
        }}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        aria-label="Search all tag sections"
        placeholder="search all tags…"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={[
          "flex-1 min-w-0 bg-transparent [outline:none] font-mono text-[length:var(--text-sm)] text-[var(--ink)] placeholder:text-[var(--muted)]",
          engaged ? "" : "max-[529px]:w-0 max-[529px]:flex-none max-[529px]:p-0",
        ].join(" ")}
      />
    </label>
  );
}
