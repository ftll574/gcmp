import { useLocale } from '../i18n/use-locale.ts';

/**
 * Taiwan-first carrier notes — two informational cards per
 * docs/taiwan-first-scope.md ("Important But Limited / Not RTW").
 *
 * Explain, don't hide:
 *
 *   ChinaAirlinesNotRtwCard — China Airlines is a Taiwan home carrier and
 *   Dynasty Flyer SkyTeam partner awards matter for complex Taiwan award
 *   plans, but CI states itineraries crossing BOTH the Pacific and the
 *   Atlantic are not accepted, so they cannot form a classic RTW ticket.
 *   When the engine's 'prohibited-ocean-combination' rule actually fails,
 *   the card links the caveat to that finding. Tone: helpful caveat, not
 *   an error wall.
 *
 *   StarluxWatchlistCard — JX COSMILE is watchlist-only: no own RTW award
 *   product today and published airline-partner redemptions center on
 *   Alaska Mileage Plan. Facts only; no availability claims.
 */

/** Product id whose rules reject both-ocean crossings (public/data/rtw-products/current.json). */
export const CHINA_AIRLINES_SKYTEAM_PRODUCT_ID = 'china-airlines-skyteam-partner-award';

export interface ChinaAirlinesNotRtwCardProps {
  /** The selected RTW product is the CI SkyTeam partner award. */
  readonly productSelected: boolean;
  /** Any leg in the routing (all groups) is operated by CI. */
  readonly carriersIncludeCi: boolean;
  /** The 'prohibited-ocean-combination' rule currently fails for this route. */
  readonly ruleTripped: boolean;
}

/**
 * Renders only when the CI product is selected or a routing leg is
 * operated by CI; otherwise renders nothing.
 */
export function ChinaAirlinesNotRtwCard({
  productSelected,
  carriersIncludeCi,
  ruleTripped,
}: ChinaAirlinesNotRtwCardProps): React.ReactElement | null {
  const { t } = useLocale();
  if (!productSelected && !carriersIncludeCi) return null;
  return (
    <section className="carrier-note carrier-note-ci" aria-label={t('carrierNotes.ci.label')}>
      <p className="carrier-note-label">
        <span className="carrier-note-dot" aria-hidden="true" />
        {t('carrierNotes.ci.label')}
      </p>
      <p className="carrier-note-body">{t('carrierNotes.ci.body')}</p>
      {ruleTripped && <p className="carrier-note-rule">{t('carrierNotes.ci.ruleTripped')}</p>}
    </section>
  );
}

/**
 * Always rendered in the Rules inspector — JX never appears as a product
 * or eligible carrier, so an unconditional quiet note is the only place a
 * user learns why STARLUX is absent from the picker.
 */
export function StarluxWatchlistCard(): React.ReactElement {
  const { t } = useLocale();
  return (
    <section className="carrier-note carrier-note-jx" aria-label={t('carrierNotes.jx.label')}>
      <p className="carrier-note-label">
        <span className="carrier-note-dot carrier-note-dot-muted" aria-hidden="true" />
        {t('carrierNotes.jx.label')}
      </p>
      <p className="carrier-note-body">{t('carrierNotes.jx.body')}</p>
    </section>
  );
}
