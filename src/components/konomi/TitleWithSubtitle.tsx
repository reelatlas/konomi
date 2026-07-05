interface TitleWithSubtitleProps {
  title: string;
  subtitle: string;
}

// The h2 + JP companion span pair only — not the surrounding flex wrapper.
// ResultsHeader and MixerBar's Row 1 both need this exact pair (same
// classes, same "title, then its JP subtitle" shape) but each also puts
// other content (MixerBar: a filled-count badge) alongside it in their own
// "flex items-center gap-[var(--space-md)]" row — leaving that wrapper to
// each caller, rather than owning it here, is what lets MixerBar still add
// that badge as a third sibling without this component needing an
// `extra`/`children` escape hatch for it.
export function TitleWithSubtitle({ title, subtitle }: TitleWithSubtitleProps) {
  return (
    <>
      <h2 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)] text-[var(--ink)]">
        {title}
      </h2>
      <span className="font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)]">{subtitle}</span>
    </>
  );
}
