/**
 * gcmp — Taiwan-first RTW award route planner
 *
 * Workbench app: RTW rule validation is primary — per-leg operating carriers,
 * stopover-vs-transfer flags, surface/open-jaw sectors, rule findings +
 * award-price estimation against the selected RTW product. Mileage earning
 * (PQM/RDM) is a collapsed secondary panel. Multi-group routings on an SVG
 * d3-geo map with 4 projections; state round-trips through hash share-URLs;
 * i18n en/zh-TW/zh-CN/ja. No beginner/pro mode.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionRow } from './components/ActionRow.tsx';
import { AirportAutocomplete } from './components/AirportAutocomplete.tsx';
import { CabinSelector } from './components/CabinSelector.tsx';
import { EarningPanel } from './components/EarningPanel.tsx';
import { Glossary } from './components/Glossary.tsx';
import { GroupTabs } from './components/GroupTabs.tsx';
import { LanguagePicker } from './components/LanguagePicker.tsx';
import { LegChain } from './components/LegChain.tsx';
import { MapErrorBoundary } from './components/MapErrorBoundary.tsx';
import { ImportFromGcmap } from './components/ImportFromGcmap.tsx';
import { MapView } from './components/MapView.tsx';
import { MobileBanner } from './components/MobileBanner.tsx';
import { ProgramPicker } from './components/ProgramPicker.tsx';
import { ProjectionPicker } from './components/ProjectionPicker.tsx';
import { RtwLegTable } from './components/RtwLegTable.tsx';
import { RtwPlanningContext } from './components/RtwPlanningContext.tsx';
import { RtwTripDates } from './components/RtwTripDates.tsx';
import { RtwValidationPanel } from './components/RtwValidationPanel.tsx';
import { SampleRoutings } from './components/SampleRoutings.tsx';
import { SavedRoutings } from './components/SavedRoutings.tsx';
import { useLocale } from './i18n/use-locale.ts';
import { buildAirportIndex } from './lib/airport-index.ts';
import { computeRouting } from './lib/calc/index.ts';
import { DEFAULT_PROJECTION, type ProjectionId } from './lib/calc/projections.ts';
import {
  eligibleAirlinesForProduct,
  firstEligibleCarrierForProduct,
  isCarrierEligibleForProduct,
} from './lib/rtw/eligible-airlines.ts';
import { preferredCarrierForProduct, sortMileageRedemptionRtwProductsForMarket } from './lib/rtw/products.ts';
import { downloadBlob, svgToPngBlob, svgToSvgBlob } from './lib/svg-to-png.ts';
import { parseShareUrl } from './lib/url-schema.ts';
import {
  PROGRAM_REGISTRY,
  type AirlineIata,
  type Airport,
  type CabinId,
  type EliteTier,
  type Iata,
  type Leg,
  type ProgramId,
  type RoutingGroup,
  type RoutingRequest,
} from './lib/types.ts';
import type { LoadedData } from './state/use-loaded-data.ts';
import { useLoadedData } from './state/use-loaded-data.ts';
import { useRoutingState } from './state/use-routing-state.ts';
import { useSavedRoutings } from './state/use-saved-routings.ts';
import { useViewportWidth } from './state/use-viewport.ts';
import './App.css';

const MOBILE_BREAKPOINT = 768;
type InspectorPanel = 'rules' | 'tools' | 'miles' | 'saved';
type ResizeHandle = 'editor' | 'inspector';

export function App(): React.ReactElement {
  const { t } = useLocale();
  const load = useLoadedData();
  const { state: routing, setRouting, shareUrl } = useRoutingState();
  const { saved, save, remove, lastError: saveError } = useSavedRoutings();
  const viewportW = useViewportWidth();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 1024, height: 600 });

  useEffect(() => {
    if (!mapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setMapSize({ width: Math.max(width, 320), height: Math.max(height, 240) });
    });
    ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, [load.status]);

  if (load.status === 'loading') {
    return (
      <div className="app-loading" role="status">
        <p>{t('loading')}</p>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="app-error" role="alert">
        <h1>gcmp</h1>
        <p>{t('errors.loadFailed', { message: load.error })}</p>
        <p>{t('errors.loadFailedHelp')}</p>
      </div>
    );
  }

  return (
    <Ready
      data={load.data}
      routing={routing.request}
      routingError={routing.error}
      setRouting={setRouting}
      saved={saved}
      save={save}
      remove={remove}
      saveError={saveError}
      isMobile={viewportW < MOBILE_BREAKPOINT}
      mapRef={mapRef}
      mapSize={mapSize}
      shareUrl={shareUrl}
    />
  );
}

interface ReadyProps {
  data: LoadedData;
  routing: RoutingRequest;
  routingError: string | null;
  setRouting: (next: RoutingRequest) => void;
  saved: ReturnType<typeof useSavedRoutings>['saved'];
  save: (name: string, url: string) => void;
  remove: (name: string) => void;
  saveError: string | null;
  isMobile: boolean;
  mapRef: React.RefObject<HTMLDivElement | null>;
  mapSize: { width: number; height: number };
  shareUrl: string | null;
}

function Ready({
  data,
  routing,
  routingError,
  setRouting,
  saved,
  save,
  remove,
  saveError,
  isMobile,
  mapRef,
  mapSize,
  shareUrl,
}: ReadyProps): React.ReactElement {
  const { t } = useLocale();
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [showBearings, setShowBearings] = useState(false);
  const [showDistances, setShowDistances] = useState(false);
  const [activeInspector, setActiveInspector] = useState<InspectorPanel>('rules');
  const [editorWidth, setEditorWidth] = useState(460);
  const [inspectorWidth, setInspectorWidth] = useState(360);
  const [resizing, setResizing] = useState<ResizeHandle | null>(null);
  const rtwProducts = useMemo(
    () => sortMileageRedemptionRtwProductsForMarket(data.rtwRuleCatalog.products, data.marketProfile),
    [data.rtwRuleCatalog.products, data.marketProfile],
  );
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Per-group pending first airport. A leg requires 2+ airports, so the very
  // first airport added to an empty group lives in this in-memory buffer
  // until the user adds a second one — at that point we promote both to a
  // real `Leg`. Not serialized to URL (a single airport is not a shareable
  // routing). Keyed by group array index; kept in sync on group removal.
  const [pendingByGroup, setPendingByGroup] = useState<ReadonlyMap<number, Airport>>(
    () => new Map(),
  );

  const airportIndex = useMemo(() => buildAirportIndex(data.airports), [data.airports]);
  const selectedRtwProductId = routing.rtwProductId ?? rtwProducts[0]?.id ?? '';
  const selectedRtwProduct = useMemo(
    () => rtwProducts.find((product) => product.id === selectedRtwProductId) ?? rtwProducts[0],
    [rtwProducts, selectedRtwProductId],
  );
  const eligibleAirlines = useMemo(
    () => eligibleAirlinesForProduct(selectedRtwProduct, data.airlines, data.allianceCatalog),
    [selectedRtwProduct, data.airlines, data.allianceCatalog],
  );
  const preferredEligibleCarrier = useMemo(
    () =>
      firstEligibleCarrierForProduct(
        selectedRtwProduct,
        data.airlines,
        data.allianceCatalog,
        preferredCarrierForProduct(selectedRtwProduct, data.marketProfile),
      ),
    [selectedRtwProduct, data.airlines, data.allianceCatalog, data.marketProfile],
  );

  useEffect(() => {
    if (rtwProducts.length === 0) return;
    if (routing.rtwProductId !== undefined && rtwProducts.some((product) => product.id === routing.rtwProductId)) {
      return;
    }
    const firstProduct = rtwProducts[0];
    if (!firstProduct) return;
    setRouting({ ...routing, rtwProductId: firstProduct.id });
  }, [routing, rtwProducts, setRouting]);

  function changeRtwProduct(productId: string): void {
    const nextProduct = rtwProducts.find((product) => product.id === productId);
    const replacementCarrier = firstEligibleCarrierForProduct(
      nextProduct,
      data.airlines,
      data.allianceCatalog,
      preferredCarrierForProduct(nextProduct, data.marketProfile),
    );
    setRouting({
      ...routing,
      rtwProductId: productId,
      groups: routing.groups.map((group) => ({
        legs: group.legs.map((leg) =>
          leg.surface === true ||
          isCarrierEligibleForProduct(leg.operatingCarrier, nextProduct, data.allianceCatalog)
            ? leg
            : { ...leg, operatingCarrier: replacementCarrier },
        ),
      })),
    });
  }

  useEffect(() => {
    if (resizing === null) return;
    function onMove(event: PointerEvent): void {
      const minSide = 340;
      const maxSide = Math.min(560, Math.max(380, window.innerWidth * 0.45));
      if (resizing === 'editor') {
        setEditorWidth(Math.min(maxSide, Math.max(minSide, event.clientX)));
      } else {
        setInspectorWidth(Math.min(maxSide, Math.max(minSide, window.innerWidth - event.clientX)));
      }
    }
    function onUp(): void {
      setResizing(null);
    }
    document.body.classList.add('is-resizing-workbench');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      document.body.classList.remove('is-resizing-workbench');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [resizing]);

  useEffect(() => {
    let changed = false;
    const nextGroups = routing.groups.map((group) => ({
      legs: group.legs.map((leg) => {
        if (
          leg.surface === true ||
          isCarrierEligibleForProduct(leg.operatingCarrier, selectedRtwProduct, data.allianceCatalog)
        ) {
          return leg;
        }
        changed = true;
        return { ...leg, operatingCarrier: preferredEligibleCarrier };
      }),
    }));
    if (changed) {
      setRouting({ ...routing, groups: nextGroups });
    }
  }, [routing, selectedRtwProduct, data.allianceCatalog, preferredEligibleCarrier, setRouting]);

  // Clamp active group when groups change.
  const safeActiveIndex = Math.min(activeGroupIndex, Math.max(0, routing.groups.length - 1));

  const activeGroup = useMemo<RoutingGroup>(
    () => routing.groups[safeActiveIndex] ?? { legs: [] },
    [routing.groups, safeActiveIndex],
  );

  const pendingAirport = pendingByGroup.get(safeActiveIndex);

  // Active group's airport chain (resolved). When legs are empty but a pending
  // first airport is buffered, show it as a single chip so the user can see
  // their progress before adding the second airport that creates the first leg.
  const activeChainAirports = useMemo<Airport[]>(() => {
    if (activeGroup.legs.length === 0) {
      return pendingAirport ? [pendingAirport] : [];
    }
    const first = activeGroup.legs[0]?.from;
    if (!first) return [];
    const codes: Iata[] = [first, ...activeGroup.legs.map((leg) => leg.to)];
    return codes
      .map((code) => airportIndex.lookup(code))
      .filter((a): a is Airport => a !== undefined);
  }, [activeGroup, airportIndex, pendingAirport]);

  const result = useMemo(() => {
    if (routing.groups.every((g) => g.legs.length === 0)) return null;
    return computeRouting(routing, {
      airports: airportIndex.byIata,
      programs: data.programs,
    });
  }, [routing, airportIndex, data.programs]);

  // "Where to credit?" — run the engine against EVERY program in the
  // registry, not just the user's selection. Used by the inverse-view
  // panel that ranks all 18+ programs for this exact routing. Memoized
  // separately so toggling the picker doesn't recompute this.
  const allProgramsResult = useMemo(() => {
    if (routing.groups.every((g) => g.legs.length === 0)) return null;
    const allIds = PROGRAM_REGISTRY.map((p) => p.id);
    return computeRouting(
      { ...routing, programs: allIds },
      { airports: airportIndex.byIata, programs: data.programs },
    );
  }, [routing, airportIndex, data.programs]);

  // ── Mutators ──

  function updateActiveGroup(updater: (g: RoutingGroup) => RoutingGroup): void {
    const nextGroups = routing.groups.map((g, i) => (i === safeActiveIndex ? updater(g) : g));
    setRouting({ ...routing, groups: nextGroups });
  }

  function setPendingFor(groupIndex: number, value: Airport | undefined): void {
    setPendingByGroup((prev) => {
      const next = new Map(prev);
      if (value === undefined) next.delete(groupIndex);
      else next.set(groupIndex, value);
      return next;
    });
  }

  function addAirport(a: Airport): void {
    // Empty group: buffer the first airport, or promote pending + new → leg.
    if (activeGroup.legs.length === 0) {
      if (!pendingAirport) {
        setPendingFor(safeActiveIndex, a);
        return;
      }
      if (pendingAirport.iata === a.iata) {
        // Same airport twice would be a zero-distance leg; ignore.
        return;
      }
      updateActiveGroup(() => ({
        legs: [
          {
            from: pendingAirport.iata,
            to: a.iata,
            operatingCarrier: preferredEligibleCarrier,
          },
        ],
      }));
      setPendingFor(safeActiveIndex, undefined);
      return;
    }
    // Has legs: append to the end as usual.
    updateActiveGroup((group) => {
      const codes = activeChainAirports.map((x) => x.iata);
      const nextCodes = [...codes, a.iata];
      const nextLegs = buildLegs(
        nextCodes,
        group.legs,
        defaultCarrier(group.legs, selectedRtwProduct, data, preferredEligibleCarrier),
      );
      return { legs: nextLegs };
    });
  }

  function removeAirport(_iata: Iata, index: number): void {
    // Removing the only chip (pending state) just clears pending.
    if (activeGroup.legs.length === 0 && pendingAirport) {
      setPendingFor(safeActiveIndex, undefined);
      return;
    }
    updateActiveGroup((group) => {
      const codes = activeChainAirports.map((x) => x.iata);
      const nextCodes = codes.filter((_, i) => i !== index);
      if (nextCodes.length < 2) {
        // Going from 2 → 1: demote the survivor back to pending.
        const remaining = nextCodes[0];
        if (remaining) {
          const air = airportIndex.lookup(remaining);
          if (air) setPendingFor(safeActiveIndex, air);
        }
        return { legs: [] };
      }
      const nextLegs = buildLegs(
        nextCodes,
        group.legs,
        defaultCarrier(group.legs, selectedRtwProduct, data, preferredEligibleCarrier),
      );
      return { legs: nextLegs };
    });
  }

  function reorder(nextCodes: ReadonlyArray<Iata>): void {
    updateActiveGroup((group) => {
      if (nextCodes.length < 2) return { legs: [] };
      const nextLegs = buildLegs(
        nextCodes,
        group.legs,
        defaultCarrier(group.legs, selectedRtwProduct, data, preferredEligibleCarrier),
      );
      return { legs: nextLegs };
    });
  }

  function changeCarrier(legIndex: number, carrier: AirlineIata): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => (i === legIndex ? { ...leg, operatingCarrier: carrier } : leg)),
    }));
  }

  function changeFareClass(legIndex: number, fareClass: string | undefined): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => {
        if (i !== legIndex) return leg;
        if (fareClass === undefined) {
          // Strip the field rather than store undefined — keeps URL clean.
          return {
            from: leg.from,
            to: leg.to,
            operatingCarrier: leg.operatingCarrier,
            ...(leg.stopover !== undefined ? { stopover: leg.stopover } : {}),
            ...(leg.surface !== undefined ? { surface: leg.surface } : {}),
          };
        }
        return { ...leg, fareClass };
      }),
    }));
  }

  function changeStopover(legIndex: number, stopover: boolean | undefined): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => {
        if (i !== legIndex) return leg;
        if (stopover === undefined) {
          return {
            from: leg.from,
            to: leg.to,
            operatingCarrier: leg.operatingCarrier,
            ...(leg.fareClass !== undefined ? { fareClass: leg.fareClass } : {}),
            ...(leg.surface !== undefined ? { surface: leg.surface } : {}),
          };
        }
        return { ...leg, stopover };
      }),
    }));
  }

  function changeSurface(legIndex: number, surface: boolean): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => {
        if (i !== legIndex) return leg;
        if (!surface) {
          return {
            from: leg.from,
            to: leg.to,
            operatingCarrier: leg.operatingCarrier,
            ...(leg.fareClass !== undefined ? { fareClass: leg.fareClass } : {}),
            ...(leg.stopover !== undefined ? { stopover: leg.stopover } : {}),
          };
        }
        return { ...leg, surface: true };
      }),
    }));
  }

  function changeLegDate(legIndex: number, departsOn: string | undefined): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => {
        if (i !== legIndex) return leg;
        if (departsOn === undefined) {
          // Strip the field rather than store undefined — keeps URL clean.
          return {
            from: leg.from,
            to: leg.to,
            operatingCarrier: leg.operatingCarrier,
            ...(leg.fareClass !== undefined ? { fareClass: leg.fareClass } : {}),
            ...(leg.stopover !== undefined ? { stopover: leg.stopover } : {}),
            ...(leg.surface !== undefined ? { surface: leg.surface } : {}),
          };
        }
        return { ...leg, departsOn };
      }),
    }));
  }

  function changeCabin(cabin: CabinId): void {
    setRouting({ ...routing, cabin });
  }

  function changeProjection(projection: ProjectionId): void {
    setRouting({ ...routing, projection });
  }

  function changeTier(tier: EliteTier): void {
    if (tier === 'none') {
      // Drop the field to keep URL clean (encoder also omits 'none').
      const next: RoutingRequest = {
        groups: routing.groups,
        cabin: routing.cabin,
        programs: routing.programs,
        ...(routing.rulesVersion !== undefined ? { rulesVersion: routing.rulesVersion } : {}),
        ...(routing.projection !== undefined ? { projection: routing.projection } : {}),
        ...(routing.startDate !== undefined ? { startDate: routing.startDate } : {}),
        ...(routing.endDate !== undefined ? { endDate: routing.endDate } : {}),
        ...(routing.rtwProductId !== undefined ? { rtwProductId: routing.rtwProductId } : {}),
      };
      setRouting(next);
    } else {
      setRouting({ ...routing, tier });
    }
  }

  function changeTripDates(dates: { startDate?: string; endDate?: string }): void {
    const next: RoutingRequest = {
      ...routing,
      ...(dates.startDate !== undefined ? { startDate: dates.startDate } : {}),
      ...(dates.endDate !== undefined ? { endDate: dates.endDate } : {}),
    };
    if (dates.startDate === undefined) {
      delete (next as { startDate?: string }).startDate;
    }
    if (dates.endDate === undefined) {
      delete (next as { endDate?: string }).endDate;
    }
    setRouting(next);
  }

  function toggleProgram(programId: ProgramId): void {
    const set = new Set(routing.programs);
    if (set.has(programId)) set.delete(programId);
    else set.add(programId);
    if (set.size === 0) return;
    setRouting({ ...routing, programs: [...set] });
  }

  function loadSaved(url: string): void {
    const parsed = parseShareUrl(url);
    if (parsed.ok) {
      const preservedRtwProductId = parsed.request.rtwProductId ?? routing.rtwProductId;
      setRouting({
        ...parsed.request,
        ...(preservedRtwProductId !== undefined ? { rtwProductId: preservedRtwProductId } : {}),
      });
      setActiveGroupIndex(0);
      setPendingByGroup(new Map());
    }
  }

  function loadExternalRouting(next: RoutingRequest): void {
    const preservedRtwProductId = next.rtwProductId ?? routing.rtwProductId;
    setRouting({
      ...next,
      ...(preservedRtwProductId !== undefined ? { rtwProductId: preservedRtwProductId } : {}),
    });
    setActiveGroupIndex(0);
    setPendingByGroup(new Map());
  }

  function clearAll(): void {
    setRouting({ ...routing, groups: [{ legs: [] }] });
    setActiveGroupIndex(0);
    setPendingByGroup(new Map());
  }

  function routingChain(): string {
    return routing.groups
      .map((g) => g.legs.map((l) => l.from).concat([g.legs[g.legs.length - 1]?.to ?? '']).filter(Boolean).join('-'))
      .filter(Boolean)
      .join('_');
  }

  async function downloadPng(transparent = false): Promise<void> {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg, { pixelRatio: 2, transparent });
      const chain = routingChain();
      const suffix = transparent ? '-transparent' : '';
      const filename = chain
        ? `${t('download.filename')}-${chain}${suffix}.png`
        : `${t('download.filename')}${suffix}.png`;
      downloadBlob(blob, filename);
    } catch (e) {
      console.error('PNG export failed:', e);
    }
  }

  function downloadSvg(transparent = false): void {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const blob = svgToSvgBlob(svg, { transparent });
      const chain = routingChain();
      const suffix = transparent ? '-transparent' : '';
      const filename = chain
        ? `${t('download.filename')}-${chain}${suffix}.svg`
        : `${t('download.filename')}${suffix}.svg`;
      downloadBlob(blob, filename);
    } catch (e) {
      console.error('SVG export failed:', e);
    }
  }

  function addGroup(): void {
    const nextGroups = [...routing.groups, { legs: [] }];
    setRouting({ ...routing, groups: nextGroups });
    setActiveGroupIndex(nextGroups.length - 1);
  }

  function removeGroup(index: number): void {
    if (routing.groups.length <= 1) return;
    const nextGroups = routing.groups.filter((_, i) => i !== index);
    setRouting({ ...routing, groups: nextGroups });
    setActiveGroupIndex(Math.min(safeActiveIndex, nextGroups.length - 1));
    // Re-key pending map: drop the deleted slot, shift later groups down by 1.
    setPendingByGroup((prev) => {
      const next = new Map<number, Airport>();
      for (const [k, v] of prev) {
        if (k < index) next.set(k, v);
        else if (k > index) next.set(k - 1, v);
      }
      return next;
    });
  }

  const hasAnyLegs = routing.groups.some((g) => g.legs.length > 0);
  const showSamples = !hasAnyLegs;

  return (
    <div className={`app${isMobile ? ' mobile' : ''}`}>
      <MobileBanner visible={isMobile} />
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-name">gcmp</span>
          <span className="app-brand-tagline">{t('brand.tagline')}</span>
        </div>
        <div className="app-header-controls">
          <LanguagePicker />
          <ActionRow
            shareUrl={shareUrl}
            canSave={hasAnyLegs}
            onSave={(name) => {
              if (shareUrl) save(name, shareUrl);
            }}
            result={result}
            routing={routing}
          />
        </div>
      </header>
      {routingError && (
        <div className="app-banner app-banner-warn" role="alert">
          ⚠ {routingError}
        </div>
      )}
      {saveError && (
        <div className="app-banner app-banner-warn" role="alert">
          ⚠ {saveError}
        </div>
      )}
      <main
        className="app-workbench"
        style={{
          '--editor-width': `${editorWidth}px`,
          '--inspector-width': `${inspectorWidth}px`,
        } as React.CSSProperties}
      >
        <section className="route-editor" aria-label="Routing input">
          <div className="route-editor-scroll">
            <details className="route-editor-details">
              <summary>{t('rtw.planningEyebrow')}</summary>
              <RtwPlanningContext
                products={rtwProducts}
                selectedProductId={selectedRtwProductId}
                marketProfile={data.marketProfile}
                onProductChange={changeRtwProduct}
              />
            </details>
            {!isMobile && (
              <AirportAutocomplete index={airportIndex} onCommit={addAirport} />
            )}
            <GroupTabs
              groups={routing.groups}
              activeIndex={safeActiveIndex}
              onActivate={setActiveGroupIndex}
              onAdd={addGroup}
              onRemove={removeGroup}
            />
            <LegChain
              airports={activeChainAirports}
              operatingCarriers={activeGroup.legs.map((leg) => leg.operatingCarrier)}
              fareClasses={activeGroup.legs.map((leg) => leg.fareClass)}
              stopovers={activeGroup.legs.map((leg) => leg.stopover)}
              surfaces={activeGroup.legs.map((leg) => leg.surface)}
              airlines={eligibleAirlines}
              onReorder={reorder}
              onRemove={removeAirport}
              onCarrierChange={changeCarrier}
              onFareClassChange={changeFareClass}
              onStopoverChange={changeStopover}
              onSurfaceChange={changeSurface}
            />
            <div className="route-editor-secondary">
              {hasAnyLegs && (
                <RtwTripDates
                  startDate={routing.startDate}
                  endDate={routing.endDate}
                  onChange={changeTripDates}
                />
              )}
              <details className="route-editor-details">
                <summary>{t('rtw.routeLegDetails')}</summary>
                <RtwLegTable
                  airports={activeChainAirports}
                  operatingCarriers={activeGroup.legs.map((leg) => leg.operatingCarrier)}
                  stopovers={activeGroup.legs.map((leg) => leg.stopover)}
                  surfaces={activeGroup.legs.map((leg) => leg.surface)}
                  departsOn={activeGroup.legs.map((leg) => leg.departsOn)}
                  schedules={data.schedules}
                  airlines={eligibleAirlines}
                  onCarrierChange={changeCarrier}
                  onStopoverChange={changeStopover}
                  onSurfaceChange={changeSurface}
                  onDateChange={changeLegDate}
                />
              </details>
            </div>
          </div>
          {hasAnyLegs && (
            <div className="route-editor-footer">
              <button type="button" className="app-clear" onClick={clearAll}>
                {t('input.clearAll')}
              </button>
            </div>
          )}
        </section>
        <button
          type="button"
          className="workbench-resizer editor-resizer"
          aria-label={t('rtw.resizeEditor')}
          onPointerDown={(event) => {
            event.preventDefault();
            setResizing('editor');
          }}
        />
        <div ref={mapRef} className="app-map-wrap">
          <div className="app-map-toolbar">
            <ProjectionPicker
              value={routing.projection ?? DEFAULT_PROJECTION}
              onChange={changeProjection}
            />
            <label className="bearings-toggle">
              <input
                type="checkbox"
                checked={showBearings}
                onChange={(e) => setShowBearings(e.target.checked)}
              />
              {t('bearings.show')}
            </label>
            <label className="bearings-toggle">
              <input
                type="checkbox"
                checked={showDistances}
                onChange={(e) => setShowDistances(e.target.checked)}
              />
              {t('distances.show')}
            </label>
            {hasAnyLegs && (
              <DownloadMenu
                onPng={() => { void downloadPng(false); }}
                onPngTransparent={() => { void downloadPng(true); }}
                onSvg={() => { downloadSvg(false); }}
                onSvgTransparent={() => { downloadSvg(true); }}
              />
            )}
          </div>
          <MapErrorBoundary groups={routing.groups}>
            <MapView
              key={routing.projection ?? DEFAULT_PROJECTION}
              airportLookup={airportIndex.byIata}
              airports={data.airports}
              activeAirports={activeChainAirports}
              groups={routing.groups}
              activeIndex={safeActiveIndex}
              width={mapSize.width}
              height={mapSize.height}
              projection={routing.projection ?? DEFAULT_PROJECTION}
              showBearings={showBearings}
              showDistances={showDistances}
              onAirportCommit={addAirport}
              onSvgReady={(el) => {
                svgRef.current = el;
              }}
            />
          </MapErrorBoundary>
        </div>
        <button
          type="button"
          className="workbench-resizer inspector-resizer"
          aria-label={t('rtw.resizeInspector')}
          onPointerDown={(event) => {
            event.preventDefault();
            setResizing('inspector');
          }}
        />
        <aside className="app-panel" aria-label="Route inspector">
          <nav className="inspector-tabs" aria-label="Route inspector sections">
            {([
              ['rules', '✓', t('rtw.inspectorRules')],
              ['tools', '＋', t('rtw.inspectorTools')],
              ['miles', '◌', t('rtw.mileageEstimate')],
              ['saved', '□', t('rtw.inspectorSaved')],
            ] as const).map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                className={`inspector-tab${activeInspector === id ? ' active' : ''}`}
                aria-pressed={activeInspector === id}
                title={label}
                onClick={() => setActiveInspector(id)}
              >
                <span aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="inspector-content">
            {activeInspector === 'rules' && (
              <RtwValidationPanel
                routing={routing}
                airports={airportIndex.byIata}
                allianceCatalog={data.allianceCatalog}
                rtwRuleCatalog={data.rtwRuleCatalog}
                awardPricingCatalog={data.awardPricingCatalog}
                marketProfile={data.marketProfile}
                countryContinents={data.countryContinents}
                airportContinentOverrides={data.airportContinentOverrides}
                networkGaps={data.networkGaps}
                ciZones={data.ciZones}
                selectedProductId={selectedRtwProductId}
                onProductChange={changeRtwProduct}
              />
            )}
            {activeInspector === 'tools' && (
              <div className="inspector-stack">
                {showSamples && <SampleRoutings onSelect={loadExternalRouting} />}
                <ImportFromGcmap onImport={loadExternalRouting} />
              </div>
            )}
            {activeInspector === 'miles' && (
              <section className="mileage-estimate">
                <div className="mileage-estimate-body visible">
                  <div className="mileage-estimate-controls">
                    <div className="app-controls-group">
                      <span className="app-controls-label">
                        <Glossary term="cabin">
                          {t('cabin.label')}
                        </Glossary>
                      </span>
                      <CabinSelector value={routing.cabin} onChange={changeCabin} />
                    </div>
                    <div className="app-controls-group">
                      <span className="app-controls-label">
                        <Glossary term="credit">
                          {t('panel.pqmLong')} / {t('panel.rdmLong')}
                        </Glossary>
                      </span>
                      <ProgramPicker active={routing.programs} onToggle={toggleProgram} />
                    </div>
                    <div className="app-controls-group">
                      <span className="app-controls-label">{t('tier.label')}</span>
                      <TierSelector value={routing.tier ?? 'none'} onChange={changeTier} />
                    </div>
                  </div>
                  <EarningPanel
                    result={result}
                    programOrder={routing.programs}
                    cabin={routing.cabin}
                    valuations={data.valuations}
                    allProgramsResult={allProgramsResult}
                    onAddProgram={(id) => {
                      if (!routing.programs.includes(id)) {
                        setRouting({ ...routing, programs: [...routing.programs, id] });
                      }
                    }}
                  />
                </div>
              </section>
            )}
            {activeInspector === 'saved' && (
              <SavedRoutings saved={saved} onLoad={loadSaved} onDelete={remove} />
            )}
          </div>
        </aside>
      </main>
      <footer className="app-footer">
        <span>
          {t('footer.openSource')} ·{' '}
          <a href="airline/" className="app-footer-link">
            {t('footer.browseByAirline')}
          </a>
        </span>
        <span className="app-footer-note">{t('footer.disclaimer')}</span>
      </footer>
    </div>
  );
}

interface TierSelectorProps {
  value: EliteTier;
  onChange: (tier: EliteTier) => void;
}

function TierSelector({ value, onChange }: TierSelectorProps): React.ReactElement {
  const { t } = useLocale();
  const tiers: ReadonlyArray<{ id: EliteTier; key: string }> = [
    { id: 'none', key: 'tier.none' },
    { id: 'mid', key: 'tier.mid' },
    { id: 'high', key: 'tier.high' },
    { id: 'top', key: 'tier.top' },
  ];
  return (
    <div className="tier-selector" role="radiogroup" aria-label={t('tier.label')}>
      {tiers.map((tt) => (
        <button
          key={tt.id}
          type="button"
          role="radio"
          aria-checked={value === tt.id}
          className={`tier-tab${value === tt.id ? ' selected' : ''}`}
          onClick={() => onChange(tt.id)}
        >
          {t(tt.key)}
        </button>
      ))}
    </div>
  );
}

interface DownloadMenuProps {
  onPng: () => void;
  onPngTransparent: () => void;
  onSvg: () => void;
  onSvgTransparent: () => void;
}

function DownloadMenu({
  onPng,
  onPngTransparent,
  onSvg,
  onSvgTransparent,
}: DownloadMenuProps): React.ReactElement {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(fn: () => void): void {
    fn();
    setOpen(false);
  }

  return (
    <div className="download-menu" ref={rootRef}>
      <button
        type="button"
        className="map-download"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((x) => !x)}
      >
        {t('download.button')} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="download-menu-popover" role="menu">
          <button type="button" role="menuitem" onClick={() => pick(onPng)}>
            {t('download.png')}
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onPngTransparent)}>
            {t('download.pngTransparent')}
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onSvg)}>
            {t('download.svg')}
          </button>
          <button type="button" role="menuitem" onClick={() => pick(onSvgTransparent)}>
            {t('download.svgTransparent')}
          </button>
        </div>
      )}
    </div>
  );
}

function defaultCarrier(
  legs: ReadonlyArray<Leg>,
  selectedProduct: ReadyProps['data']['rtwRuleCatalog']['products'][number] | undefined,
  data: ReadyProps['data'],
  preferredEligibleCarrier: AirlineIata,
): AirlineIata {
  const firstCarrier = legs[0]?.operatingCarrier;
  if (
    firstCarrier !== undefined &&
    isCarrierEligibleForProduct(firstCarrier, selectedProduct, data.allianceCatalog)
  ) {
    return firstCarrier;
  }
  return preferredEligibleCarrier;
}

function buildLegs(
  codes: ReadonlyArray<Iata>,
  existing: ReadonlyArray<Leg>,
  defaultOp: AirlineIata,
): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i < codes.length - 1; i++) {
    const from = codes[i];
    const to = codes[i + 1];
    if (!from || !to) continue;
    const prev = existing[i];
    if (prev && prev.from === from && prev.to === to) {
      legs.push(prev);
    } else {
      legs.push({ from, to, operatingCarrier: defaultOp });
    }
  }
  return legs;
}
