import type { MarketProfile } from '../lib/schemas/market.ts';
import type { RtwRuleSet } from '../lib/schemas/rtw-rule.ts';
import { preferredCarrierForProduct } from '../lib/rtw/products.ts';
import { useLocale } from '../i18n/use-locale.ts';

interface RtwPlanningContextProps {
  readonly products: ReadonlyArray<RtwRuleSet>;
  readonly selectedProductId: string;
  readonly marketProfile: MarketProfile;
  readonly onProductChange: (productId: string) => void;
}

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

      <label className="rtw-planning-product">
        <span>{t('rtw.product')}</span>
        <select value={selectedProduct.id} onChange={(event) => onProductChange(event.target.value)}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.label}
              {product.status !== 'active' ? ` (${product.status})` : ''}
            </option>
          ))}
        </select>
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
