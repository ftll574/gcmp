import type { MarketProfile } from '../lib/schemas/market.ts';
import type { RtwRuleSet } from '../lib/schemas/rtw-rule.ts';
import { preferredCarrierForProduct } from '../lib/rtw/products.ts';
import { useLocale } from '../i18n/use-locale.ts';
import { CabinSelector } from './CabinSelector.tsx';
import type { CabinId } from '../lib/types.ts';

interface RtwPlanningContextProps {
  readonly products: ReadonlyArray<RtwRuleSet>;
  readonly selectedProductId: string;
  readonly marketProfile: MarketProfile;
  readonly onProductChange: (productId: string) => void;
  /** Routing-wide cabin — drives the award price estimate, not earning. */
  readonly cabin: CabinId;
  readonly onCabinChange: (cabin: CabinId) => void;
  /**
   * Two-step selection step 2 display: member carriers of the selected
   * product's alliance (route-discovery.allianceMemberCarriers). Absent for
   * products without an alliance — the chips row simply hides.
   */
  readonly allianceCarriers?: ReadonlyArray<{ readonly code: string; readonly name: string }>;
}

/** Canonical chip order, Taiwan-market preference first. */
const ALLIANCE_CHIP_ORDER = ['star', 'oneworld', 'skyteam'] as const;

function productKindLabel(kind: RtwRuleSet['kind'], t: (key: string) => string): string {
  if (kind === 'cash-rtw-fare') return t('rtw.productKind.cash');
  if (kind === 'award-rtw') return t('rtw.productKind.award');
  return t('rtw.productKind.multiCarrier');
}

function startEndLabel(
  startEnd: RtwRuleSet['geography']['startEnd'],
  t: (key: string) => string,
): string {
  if (startEnd === 'same-city') return t('rtw.startEnd.sameCity');
  if (startEnd === 'same-country') return t('rtw.startEnd.sameCountry');
  return t('rtw.startEnd.open');
}

function limitSummary(product: RtwRuleSet, t: (key: string, params?: Record<string, string | number>) => string): string {
  const parts: string[] = [];
  if (product.limits.maxFlights !== undefined) {
    parts.push(t('rtw.limits.maxFlights', { count: product.limits.maxFlights }));
  }
  if (product.limits.maxStopovers !== undefined) {
    parts.push(t('rtw.limits.maxStopovers', { count: product.limits.maxStopovers }));
  }
  if (product.limits.maxDistanceMiles !== undefined) {
    parts.push(t('rtw.limits.distanceCap', { count: product.limits.maxDistanceMiles.toLocaleString() }));
  }
  return parts.join(' · ') || t('rtw.limits.rulesLoaded');
}

export function RtwPlanningContext({
  products,
  selectedProductId,
  marketProfile,
  onProductChange,
  cabin,
  onCabinChange,
  allianceCarriers,
}: RtwPlanningContextProps): React.ReactElement {
  const { t } = useLocale();
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? products[0];

  if (!selectedProduct) {
    return (
      <section className="rtw-planning-context" aria-label="RTW planning context">
        <p>{t('rtw.noProducts')}</p>
      </section>
    );
  }

  const requiresOceans = [
    selectedProduct.geography.requiresPacificCrossing ? 'Pacific' : null,
    selectedProduct.geography.requiresAtlanticCrossing ? 'Atlantic' : null,
  ].filter((ocean): ocean is string => ocean !== null);
  const preferredCarrier = preferredCarrierForProduct(selectedProduct, marketProfile);
  const marketEntry = marketProfile.priorityPrograms.find((program) => program.id === selectedProduct.id);
  const localizedMarket = t(`rtw.market.${marketProfile.market}`);
  const marketLabel = localizedMarket === `rtw.market.${marketProfile.market}`
    ? marketProfile.label
    : localizedMarket;

  // Two-step selection, step 1: alliances present in the product list, in
  // canonical chip order. Clicking a chip jumps to that alliance's first
  // (market-preferred) product — alliance itself is derived state, never
  // a new URL parameter.
  const alliances = ALLIANCE_CHIP_ORDER.filter((alliance) =>
    products.some((product) => product.alliance === alliance),
  );

  return (
    <section className="rtw-planning-context" aria-label="RTW planning context">
      <div className="rtw-planning-head">
        <div>
          <p className="rtw-eyebrow">{t('rtw.planningEyebrow')}</p>
          <h2>{t('rtw.planningTitle', { market: marketLabel })}</h2>
        </div>
        <span className={`rtw-product-relevance ${marketEntry?.rtwRelevance ?? 'watch'}`}>
          {marketEntry?.rtwRelevance ?? 'watch'}
        </span>
      </div>

      {alliances.length > 0 && (
        <div className="rtw-alliance-chips" role="group" aria-label={t('rtw.alliance')}>
          {alliances.map((alliance) => (
            <button
              key={alliance}
              type="button"
              className={`rtw-alliance-chip${selectedProduct.alliance === alliance ? ' active' : ''}`}
              aria-pressed={selectedProduct.alliance === alliance}
              onClick={() => {
                if (selectedProduct.alliance !== alliance) {
                  const first = products.find((product) => product.alliance === alliance);
                  if (first) onProductChange(first.id);
                }
              }}
            >
              {t(`alliance.${alliance}`)}
            </button>
          ))}
        </div>
      )}
      {selectedProduct.alliance !== undefined && allianceCarriers !== undefined && allianceCarriers.length > 0 && (
        <p className="rtw-member-carriers">
          <span>{t('rtw.memberCarriers')}</span>
          {allianceCarriers.map((carrier) => (
            <span key={carrier.code} className="rtw-member-carrier" title={carrier.name}>
              {carrier.code}
            </span>
          ))}
        </p>
      )}

      <label className="rtw-planning-product">
        <span>{t('rtw.product')}</span>
        {/*
          Two-step selection step 2: once an alliance is active the product
          list narrows to that alliance only — cross-alliance products stay
          reachable through the alliance chips above, never through this
          select (user-reported leak, 2026-08-26).
        */}
        <select value={selectedProduct.id} onChange={(event) => onProductChange(event.target.value)}>
          {(selectedProduct.alliance === undefined
            ? products.filter((product) => product.alliance === undefined)
            : products.filter((product) => product.alliance === selectedProduct.alliance)
          ).map((product) => (
            <option key={product.id} value={product.id}>
              {product.label}
              {product.status !== 'active' ? ` (${product.status})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="rtw-planning-product rtw-planning-cabin">
        <span>{t('cabin.label')}</span>
        <CabinSelector value={cabin} onChange={onCabinChange} />
      </label>

      <div className="rtw-planning-facts">
        <div>
          <span>{t('rtw.alliance')}</span>
          <strong>{selectedProduct.alliance ?? selectedProduct.owner}</strong>
        </div>
        <div>
          <span>{t('rtw.type')}</span>
          <strong>{productKindLabel(selectedProduct.kind, t)}</strong>
        </div>
        <div>
          <span>{t('rtw.startEnd.label')}</span>
          <strong>{startEndLabel(selectedProduct.geography.startEnd, t)}</strong>
        </div>
        <div>
          <span>{t('rtw.carrierSeed')}</span>
          <strong>{preferredCarrier}</strong>
        </div>
      </div>

      <p className="rtw-planning-summary">
        {limitSummary(selectedProduct, t)}
        {requiresOceans.length > 0
          ? ` · ${t('rtw.limits.crossOceans', { oceans: requiresOceans.map((ocean) => t(`rtw.ocean.${ocean.toLowerCase()}`)).join(' + ') })}`
          : ''}
      </p>
      {selectedProduct.bookingStatusNote && (
        <p className="rtw-planning-note">{selectedProduct.bookingStatusNote}</p>
      )}
      {marketEntry?.notes?.[0] && <p className="rtw-planning-note">{marketEntry.notes[0]}</p>}
    </section>
  );
}
