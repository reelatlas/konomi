import { DEFAULT_ACCENT } from "@/lib/konomi/config";
import type { MixerError } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { ArrowRightFilledIcon } from "./icons";

const STAR_CLIP = "[clip-path:polygon(50%_0,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]";

// Half of (mt-space-xs gap + subtext height) = (4 + 27) / 2, measured live,
// shifts the star+button block up by exactly enough that the whole
// block+subtext group re-centers on the same point the button alone used to
// occupy, rather than the subtext just growing the block downward. Subtext
// height jumped from a bare 15px text line to 27px once it became a bordered/
// padded chip (see that span's own comment below). Re-measured, not just
// reused, since this shift only stays correct for whatever the subtext's
// current real height actually is.
const ERROR_SHIFT = "-translate-y-[15.5px]";

// Exported so ResultCard's swap-icon hover hint can reuse the exact same
// wording for the same two underlying conditions, rather than duplicating
// these strings — swap and RECOMMEND fail for identical reasons (tag count
// below MIN MATCH, or nothing left that qualifies).
export const ERROR_MESSAGE: Record<NonNullable<MixerError>, string> = {
  "impossible-min": "lower MIN MATCH",
  "no-match": "no series match",
};

interface RecommendButtonProps {
  filledCount: number;
  onRecommend: () => void;
  error: MixerError;
}

export function RecommendButton({ filledCount, onRecommend, error }: RecommendButtonProps) {
  const enabled = filledCount > 0 && !error;
  const accent = DEFAULT_ACCENT;

  return (
    // No min-w here (deliberately, unlike min-h below): a fixed min-width
    // used to reserve room for the star's layers, but the star is
    // absolutely positioned and centered on the in-flow <button> alone, so
    // that reserved width just became invisible padding to the button's
    // right once ml-auto (in MixerSection) right-aligned this box instead
    // of the button itself — pushing the visible button ~18px short of
    // flush with MatchSelector's edge above it. Shrink-wrapping to the
    // button's own width (and letting the star overflow the frame instead,
    // per explicit product decision) makes ml-auto align the real edge.
    //
    // No self-start, and no min-h-[92px], either — both were leftovers from
    // when this box sat in its own row beside the tag slots specifically
    // (92px to match TagSlot's own height, self-start to align to that
    // row's top). It now lives inside MixerSection's row 4 alongside MIN
    // TAG MATCH/Random/Clear instead, none of which are anywhere near 92px
    // tall (confirmed live: Random measures 44.5px) — forcing this one
    // child to 92px made the *whole row* 92px tall for cross-axis purposes,
    // and centering everything shorter within that within row 4's own box
    // left ~26px of dead space above and below the actually-visible
    // controls, stacking with the real token-based gaps on both sides of
    // row 4 to make them read as roughly double what they actually are.
    // Removing both leaves this wrapper's height to fall out naturally from
    // its one in-flow child (the `<button>` itself — the star layers and
    // error hint are all `absolute`, so they don't contribute to it),
    // matching its row-mates and centering correctly among them.
    <div className="flex-none flex items-center justify-center">
      <div
        // contain-[layout] — the star squares below rotate continuously
        // (kono-spin, 20s linear infinite) and are deliberately left
        // unclipped so they can overflow past MixerBar's own card on every
        // side, "the intended look, not a bug to contain" (see this file's
        // own DESIGN_SYSTEM.md section — do not add overflow-hidden/clip
        // anywhere in this stack to "fix" that, it was tried and reverted
        // by explicit request). The problem this actually fixes is
        // different from clipping: a rotating square's own axis-aligned
        // bounding box continuously grows and shrinks as it turns (largest
        // at 45°/135°/etc., where it reaches the diagonal; smallest at
        // 0°/90°/etc.) — and with nothing between here and <html> setting
        // `overflow` to anything but the default `visible`, that
        // continuously-changing box was feeding straight into
        // document.documentElement's own scrollable overflow, confirmed
        // live as a real, permanent bug: document.documentElement.
        // scrollHeight oscillated by a couple px, forever, for as long as
        // the page stayed open (froze solid the instant the animation was
        // paused, in either direction — pausing it, or containing it here).
        // `contain: layout` isolates this element's own layout/overflow
        // contribution from its ancestors WITHOUT clipping paint (unlike
        // `contain: paint`/`overflow: hidden`, which would) — confirmed
        // live via screenshot in every variant (enabled, the zero-tags
        // disabled/dimmed state, and the error state's paused+shifted
        // form): the star still renders fully, still visibly overflows past
        // the card exactly as before, while document.documentElement.
        // scrollHeight stays perfectly constant regardless of rotation
        // angle or which of those three states is active.
        className={[
          "relative flex items-center justify-center transition-transform duration-200 [contain:layout]",
          error ? ERROR_SHIFT : "",
        ].join(" ")}
      >
        <div
          className={[
            // kono-star marker: MixerBar pauses these two continuously-
            // rotating clipped layers during a live resize drag (sets
            // data-mixbar-resizing on <html>; the rule lives in globals.css).
            // Two always-on rotating clip-path layers keep the compositor
            // re-compositing every frame, which piles onto the drag's own
            // per-frame composite cost on a real phone — pausing them for the
            // gesture's duration removes that pile-up. Same
            // animation-play-state mechanism the error state already uses, so
            // it freezes at the current angle and resumes cleanly.
            "kono-star",
            "absolute w-[128px] h-[128px] bg-[var(--ink)] z-[var(--z-base)]",
            STAR_CLIP,
            "animate-[kono-spin_20s_linear_infinite]",
            // animation-play-state, not adding/removing the animation
            // class: removing the class entirely drops the animation's
            // transform and snaps back to the element's base (untransformed,
            // 0deg) state. Pausing freezes it exactly at its current
            // rotation, and un-pausing resumes from that same point — no
            // manual angle-tracking needed, the browser already does it.
            error ? "[animation-play-state:paused]" : "[animation-play-state:running]",
            enabled ? "opacity-100" : "opacity-35",
          ].join(" ")}
        />
        <div
          className={[
            "kono-star",
            "absolute w-[118px] h-[118px] z-[var(--z-base)]",
            STAR_CLIP,
            "animate-[kono-spin_20s_linear_infinite]",
            error ? "[animation-play-state:paused]" : "[animation-play-state:running]",
            accent === "primary" ? "bg-[var(--secondary)]" : "bg-[var(--primary)]",
            enabled ? "opacity-95" : "opacity-35",
          ].join(" ")}
        />
        {/* ActionButton's own base (font-mono/text-xs/tracking-xl/uppercase,
            border-base/border-ink, px-xl/py-lg) matches Random/Clear's exact
            type treatment and padding, so all three Mixer action buttons
            render at the same size instead of RECOMMEND standing taller on
            its former font-display/text-lg styling. `relative z-[var(--z-raised)]`
            is this button's own one-off, layered on top via `className` — it
            needs to paint above the star layers behind it, which no other
            ActionButton caller needs. */}
        {/* Icon-only below min-[1071px]: this is one of five controls
            (Tag Pool, Clear, Min Match's own label, Random, and this one)
            that all switch to their icon-only form at the exact SAME
            shared threshold now (RUNG 2 of MixerBar's own unified
            priority ladder, see that file's own Row 2 comment for the
            full ladder and why 1071px specifically, it's tied to this
            row's own pre-existing full-form ceiling, not an independently
            bisected value). Kept in sync with MixerBar's own breakpoint
            deliberately: this button is one rung in that row's single
            chain, not a standalone responsive component anymore.
            aria-label carries the accessible name unconditionally (not
            just below the breakpoint) since a CSS breakpoint can't toggle
            an ARIA attribute at runtime, one static label covers both
            visual forms. */}
        {/* max-[1070px]:w-[var(--control-h-md)]/px-0 — the icon-only form
            (below) sits in the exact same square (--control-h-md, 44px), with
            the same centered-no-padding treatment, as Tag Pool/Clear/Random's
            siblings — requested directly. This stays one ActionButton
            (unlike those three, which are two full sibling instances) since
            RECOMMEND's real disabled attribute and its accent color-swap
            both live on ActionButton's own disabled handling, and
            IconButton's props deliberately omit `disabled` entirely (see
            that component's own comment on `visuallyDisabled` — a native
            `disabled` blocks clicks outright, which this button genuinely
            needs). Overriding just width/horizontal-padding at the
            icon-only breakpoint gets the same square box without giving up
            that native disabled behavior. Safe against Tailwind's own
            "unprefixed utilities aren't ordered by source position" trap
            (see IconButton.tsx's `display` prop comment for the general
            rule) specifically because these are max-width-*variant*
            utilities, not two bare unprefixed ones — variants are always
            layered after their bare counterparts in Tailwind's generated
            CSS regardless of source order, so max-[1070px]:px-0 reliably
            wins over SIZE_CLASSES.md's own unconditional px-[space-xl]
            once the media query is active. */}
        <ActionButton
          variant="accent"
          accentColor={accent}
          disabled={!enabled}
          onClick={onRecommend}
          aria-label="Recommend"
          className="relative z-[var(--z-raised)] max-[1070px]:w-[var(--control-h-md)] max-[1070px]:px-0"
        >
          <span className="hidden min-[1071px]:inline">RECOMMEND ▸</span>
          <ArrowRightFilledIcon className="min-[1071px]:hidden" />
        </ActionButton>
        {error && (
          // Same opaque bordered/shadowed chip treatment as ResultCard's
          // own lock/swap icon hints (bg-surface/border-thin/shadow-elev-1),
          // requested directly so this reads at a glance instead of relying
          // on plain colored text. That plain-text version (--primary-deep,
          // a bold, high-contrast variant of primary, see types.ts) worked
          // well enough against this bar's own flat surface, but the same
          // approach on ResultCard's arbitrary cover art is what motivated
          // the chip treatment there in the first place, and this control's
          // error state deserves the same legibility regardless of what's
          // behind it.
          <span className="absolute top-full mt-[var(--space-xs)] whitespace-nowrap bg-[var(--surface)] border-[length:var(--border-thin)] border-[var(--ink)] shadow-[var(--elev-1)] px-[var(--space-sm)] py-[var(--space-xs)] font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xs)] text-[var(--ink)]">
            {ERROR_MESSAGE[error]}
          </span>
        )}
      </div>
    </div>
  );
}
