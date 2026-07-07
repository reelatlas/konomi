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
export function SectionTabStrip({ sections, activeKey, onChange, visible = true }: SectionTabStripProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  // Brings the active tab into view whenever it changes — a click already
  // scrolled there by definition, but arrow-key nav can move focus past
  // whatever's currently visible in the strip. scrollIntoView on the tab
  // button itself finds its nearest scrollable ancestor (ScrollFadeArea's
  // own viewport) automatically, so this doesn't need a handle to that
  // internal element — ScrollFadeArea deliberately doesn't expose one.
  // block: "nearest" keeps this from also scrolling the page vertically —
  // true whenever this strip is actually visible, but confirmed live as a
  // real bug while it isn't: with no non-clipped block-axis scrollable
  // ancestor nearby (this strip's own ScrollFadeArea viewport is
  // horizontal-only, overflow-y hidden), "nearest" walks all the way up to
  // the document itself and scrolls the *page* to bring this clipped,
  // invisible button into view — reproduced on every fresh load, since
  // this component mounts (and this effect fires) even while collapsed.
  // Guarding on `visible` is required, not optional, once a caller can be
  // mounted-but-clipped at all.
  useEffect(() => {
    if (!visible) return;
    tabRefs.current.get(activeKey)?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
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
    <ScrollFadeArea orientation="horizontal" scrollStep={SCROLL_STEP} fadeSize={12} surfaceColor="var(--surface)" fitContent>
      <div role="tablist" aria-label="Tag pool sections" onKeyDown={handleKeyDown} className="flex flex-nowrap items-center gap-[var(--space-xl)]">
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
              id={`tagpool-tab-${section.key}`}
              aria-selected={active}
              aria-controls={`tagpool-panel-${section.key}`}
              tabIndex={active ? 0 : -1}
              type="button"
              onClick={() => onChange(section.key)}
              className="shrink-0 cursor-pointer"
            >
              {/* Same font/size/style as the old CollapsibleSection header
                  labels (font-display text-lg uppercase tracking-sm) —
                  deliberately one step smaller than PanelToggleHeader's
                  text-xl toggle above it, so the two rows read as a
                  hierarchy (panel tabs, then section tabs within Tag
                  Pool) rather than one flattened row of controls. No
                  chevron — sections are tabs now, nothing to expand. */}
              <span className="inline-flex items-center gap-[var(--space-sm)]">
                <span
                  className={[
                    "font-display text-[length:var(--text-lg)] uppercase tracking-[var(--tracking-sm)]",
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
