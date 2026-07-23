"use client";

import { useEffect, useRef } from "react";
import { ScrollFadeArea } from "./ScrollFadeArea";

export interface SectionTabItem {
  key: string;
  label: string;
  selectedCount: number;
}

interface SectionTabStripProps {
  sections: SectionTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  // "primary" (default): the top-level section row — display face, text-lg,
  // the existing look. "secondary": the film side's subsection tier below it
  // — mono/small, matching the register of the anime Theme subsection
  // labels so the two rows read as a hierarchy, but ink/muted-colored like
  // real tabs since these ARE tabs, not inline headings.
  size?: "primary" | "secondary";
  // Element-id namespace for role=tab/aria-controls wiring — tab ids become
  // `${idBase}-tab-${key}`, and the caller's matching panel must use
  // `${idBase}-panel-${key}`. Defaults to the historical "tagpool"; the
  // subsection tier passes its own so two strips on screen never collide.
  idBase?: string;
  ariaLabel?: string;
  // False whenever this strip's own container is currently clipped to zero
  // height (MixerBar's collapsed, browse-mode `max-h-0 overflow-hidden` —
  // TagPoolBody, and this strip inside it, stay mounted the whole time, not
  // just while edit mode is open; see TagPoolBody's own top comment on why).
  // Guards the scrollIntoView effect below: confirmed live as a real bug
  // without this — a button clipped inside a zero-height ancestor still
  // reports its own natural (non-zero) offsetHeight, so there's no local,
  // DOM-only signal this component could check on its own to notice it's
  // currently invisible; the caller has to say so explicitly. Defaults to
  // true so no other caller (there are none yet, but none should have to
  // opt in for normal behavior) needs to pass this.
  visible?: boolean;
}

// Tuned against the strip's own rendered width — not a card, so no
// per-tier measurement needed the way the results carousel's card width is
// (see RecommendationsBody's getScrollStep). Verify/retune live if the tab
// count or label lengths change enough to make one click feel like too
// little or too much.
const SCROLL_STEP = 140;

// Real tablist: role=tab/tablist, aria-selected, roving tabindex (only the
// active tab is in the natural tab order; arrow keys move — and, per the
// "automatic activation" model below, also activate — the others).
export function SectionTabStrip({
  sections,
  activeKey,
  onChange,
  size = "primary",
  idBase = "tagpool",
  ariaLabel = "Tag pool sections",
  visible = true,
}: SectionTabStripProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  // Brings the active tab into view whenever it changes — a click already
  // scrolled there by definition, but arrow-key nav can move focus past
  // whatever's currently visible in the strip.
  //
  // A first version of this called plain scrollIntoView({ inline: "nearest",
  // block: "nearest" }) on the tab button itself, relying on it to find its
  // nearest scrollable ancestor (ScrollFadeArea's own viewport)
  // automatically, so it wouldn't need a handle to that internal element —
  // ScrollFadeArea deliberately doesn't expose one. block: "nearest" was
  // meant to keep this from also scrolling the page vertically, on the
  // (wrong) assumption that "nearest" means "never move this axis" rather
  // than what it actually means: scroll whichever nearby container CAN
  // move on that axis, by the smallest amount that satisfies it — if
  // *nothing* between this button and the document itself is vertically
  // scrollable (true here: this strip's own ScrollFadeArea viewport is
  // horizontal-only, overflow-y hidden, and nothing above it — dialogRef,
  // cardRef — sets any vertical overflow either), the browser keeps
  // walking up and lands on the document, and scrolls the whole *page*
  // vertically to satisfy "nearest." Confirmed live, twice: once while this
  // strip is mounted-but-clipped (collapsed browse mode — fixed by the
  // `visible` guard below, kept as-is), and a second time — this fix —
  // while genuinely visible, on a short (landscape/rotated) viewport:
  // opening edit mode there can leave the tab strip positioned above the
  // still-scrolled-to-the-bottom viewport's own top edge, and "nearest"
  // then smooth-scrolls the entire page upward (confirmed live: scrollY
  // dropped ~215px, correctly pulling a previously not-yet-stuck bar back
  // into sticky range) to reveal a button the user never asked to bring
  // into view — this strip's own horizontal position was the only thing
  // that ever needed correcting. Worse than just an unwanted jump: an
  // animated ("smooth") page scroll left mid-flight when the user's very
  // next tap lands is a real, moving target — whatever's on screen at that
  // exact frame is what the tap resolves against, not whatever was there
  // when the gesture started, which reads as taps hitting the wrong
  // row/control entirely (confirmed live as a distinct, separately
  // reported symptom this same call was the root cause of).
  //
  // Fixed by doing the *only* adjustment this strip ever actually needs —
  // horizontal — by hand, directly against its own known scroll viewport
  // (found via data-scroll-fade-orientation="horizontal", the same marker
  // MixerBar's own blockScrollThrough uses to identify a ScrollFadeArea
  // instance from outside it — a DOM query, not a ref, so this still
  // doesn't need ScrollFadeArea to expose one), instead of asking
  // scrollIntoView to walk the ancestor chain and improvise an axis this
  // strip was never supposed to touch.
  useEffect(() => {
    if (!visible) return;
    const tab = tabRefs.current.get(activeKey);
    const scroller = tab?.closest<HTMLElement>('[data-scroll-fade-orientation="horizontal"]');
    if (!tab || !scroller) return;
    const tabRect = tab.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    if (tabRect.left < scrollerRect.left) {
      scroller.scrollBy({ left: tabRect.left - scrollerRect.left, behavior: "smooth" });
    } else if (tabRect.right > scrollerRect.right) {
      scroller.scrollBy({ left: tabRect.right - scrollerRect.right, behavior: "smooth" });
    }
  }, [activeKey, visible]);

  const activeIndex = sections.findIndex((s) => s.key === activeKey);

  // "Automatic activation": arrow keys immediately switch the active
  // section (and move focus with it), not just move focus and wait for a
  // separate activate key — matching how OS-level tab strips behave, and
  // simpler than tracking focus and selection as two separate states.
  // Wraps at both ends (Home/End jump straight to the first/last tab).
  function activate(index: number) {
    const wrapped = (index + sections.length) % sections.length;
    const section = sections[wrapped];
    onChange(section.key);
    tabRefs.current.get(section.key)?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        activate(activeIndex + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        activate(activeIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        activate(0);
        break;
      case "End":
        e.preventDefault();
        activate(sections.length - 1);
        break;
    }
  }

  return (
    // fitContent: this row's tab buttons are naturally-sized (text-based,
    // no percentage/fr sizing), so measuring/sizing this wrapper to their
    // true intrinsic width is exactly what's wanted — see ScrollFadeArea's
    // own comment on that prop for why it isn't the default for every
    // horizontal caller (the results carousel's CSS grid needs the
    // opposite: a real available width to size its own columns against).
    <ScrollFadeArea orientation="horizontal" scrollStep={SCROLL_STEP} fadeSize={12} surfaceColor="var(--surface)" fitContent restrictTouchAction>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className={["flex flex-nowrap items-center", size === "primary" ? "gap-[var(--space-xl)]" : "gap-[var(--space-lg)]"].join(" ")}
      >
        {sections.map((section) => {
          const active = section.key === activeKey;
          return (
            <button
              key={section.key}
              ref={(el) => {
                if (el) tabRefs.current.set(section.key, el);
                else tabRefs.current.delete(section.key);
              }}
              role="tab"
              id={`${idBase}-tab-${section.key}`}
              aria-selected={active}
              aria-controls={`${idBase}-panel-${section.key}`}
              tabIndex={active ? 0 : -1}
              type="button"
              onClick={() => onChange(section.key)}
              className="shrink-0 cursor-pointer"
            >
              {/* Primary: same font/size/style as the old CollapsibleSection
                  header labels (font-display text-lg uppercase tracking-sm)
                  — deliberately one step smaller than PanelToggleHeader's
                  text-xl toggle above it, so the two rows read as a
                  hierarchy (panel tabs, then section tabs within Tag
                  Pool) rather than one flattened row of controls. No
                  chevron — sections are tabs now, nothing to expand.
                  Secondary drops to the mono/2xs register of the anime
                  Theme subsection headings for the same hierarchy reason,
                  one tier further down. */}
              <span className="inline-flex items-center gap-[var(--space-sm)]">
                <span
                  className={[
                    size === "primary"
                      ? "font-display text-[length:var(--text-lg)] uppercase tracking-[var(--tracking-sm)]"
                      : "font-mono font-bold text-[length:var(--text-2xs)] uppercase tracking-[var(--tracking-xl)]",
                    active ? "text-[var(--ink)]" : "text-[var(--muted)]",
                  ].join(" ")}
                >
                  {section.label}
                </span>
                {section.selectedCount > 0 && (
                  <span className="font-mono font-bold text-[length:var(--text-2xs)] leading-none bg-[var(--fill)] border-[length:var(--border-hair)] border-[var(--ink)] px-[var(--space-sm)] py-[var(--space-xs)]">
                    {section.selectedCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </ScrollFadeArea>
  );
}
