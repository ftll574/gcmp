/**
 * gcmp — Taiwan-first RTW award route planner
 *
 * Workbench app: RTW rule validation is primary — per-leg operating carriers,
 * stopover-vs-transfer flags, surface/open-jaw sectors, rule findings +
 * award-price estimation against the selected RTW product. Multi-group
 * routings on an SVG d3-geo map (single default projection; distance labels).
 * State round-trips through hash share-URLs; i18n en/zh-TW.
 *
 * Removed by docs/convergence-contract.md §5: the earning/PQM/RDM panel,
 * projection picker, bearing labels, PNG/SVG map export, fee-schedule cards,
 * and the zh-CN/ja locales. URL params p/c/st/fc/proj still PARSE for
 * backward compatibility with already-shared URLs — they are just inert.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { isCalendarDate } from './lib/calendar-date.ts';
import { selectedDepartureDate, type FlightSelection } from './lib/schemas/dated-schedules.ts';
import { ActionRow } from './components/ActionRow.tsx';
import { AirportAutocomplete } from './components/AirportAutocomplete.tsx';
import { GroupTabs } from './components/GroupTabs.tsx';
import { LanguagePicker } from './components/LanguagePicker.tsx';
import { LegChain } from './components/LegChain.tsx';
import { MapErrorBoundary } from './components/MapErrorBoundary.tsx';
import { MobileBanner } from './components/MobileBanner.tsx';
import { RtwLegTable } from './components/RtwLegTable.tsx';
import { RtwPlanGate } from './components/RtwPlanGate.tsx';
import { DestinationsPanel } from './components/DestinationsPanel.tsx';
import { clearLegField, reindexLegs } from './lib/rtw/itinerary-edit.ts';
import type { NextLegMapGuide } from './lib/rtw/next-leg-discovery.ts';
import { RtwTripDates } from './components/RtwTripDates.tsx';
import { RtwValidationPanel } from './components/RtwValidationPanel.tsx';
import { useLocale } from './i18n/use-locale.ts';
import { buildAirportIndex } from './lib/airport-index.ts';
import { computeRouting } from './lib/calc/index.ts';
import { DEFAULT_PROJECTION } from './lib/calc/projection-model.ts';
import {
  eligibleAirlinesForProduct,
  firstEligibleCarrierForProduct,
  isCarrierEligibleForProduct,
} from './lib/rtw/eligible-airlines.ts';
import { preferredCarrierForProduct, sortMileageRedemptionRtwProductsForMarket } from './lib/rtw/products.ts';
import { seasonalItineraryLegs } from './lib/rtw/seasonal-itinerary.ts';
import { parseShareUrl } from './lib/url-schema.ts';
import {
  isFlightLeg,
  isSurfaceLeg,
  type AirlineIata,
  type Airport,
  type CabinId,
  type FlightLeg,
  type Iata,
  type Leg,
  type RoutingGroup,
  type RoutingRequest,
  type SurfaceLeg,
} from './lib/types.ts';
import type { LoadedData } from './state/use-loaded-data.ts';
import { useLoadedData } from './state/use-loaded-data.ts';
import { useRoutingState } from './state/use-routing-state.ts';
import { useSavedRoutings } from './state/use-saved-routings.ts';
import { useViewportWidth } from './state/use-viewport.ts';
import './App.css';

const LazyMapView = lazy(() =>
  import('./components/MapView.tsx').then((module) => ({ default: module.MapView })),
);
const LazySeasonalItineraryFinder = lazy(() =>
  import('./components/SeasonalItineraryFinder.tsx').then((module) => ({
    default: module.SeasonalItineraryFinder,
  })),
);
const LazySampleRoutings = lazy(() =>
  import('./components/SampleRoutings.tsx').then((module) => ({ default: module.SampleRoutings })),
);
const LazyImportFromGcmap = lazy(() =>
  import('./components/ImportFromGcmap.tsx').then((module) => ({ default: module.ImportFromGcmap })),
);
const LazySavedRoutings = lazy(() =>
  import('./components/SavedRoutings.tsx').then((module) => ({ default: module.SavedRoutings })),
);

const MOBILE_BREAKPOINT = 768;
type InspectorPanel = 'rules' | 'tools' | 'saved';
type ResizeHandle = 'editor';

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
  const hasAnyLegs = routing.groups.some((g) => g.legs.length > 0);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [showDistances, setShowDistances] = useState(false);
  const [activeInspector, setActiveInspector] = useState<InspectorPanel>('rules');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [editorWidth, setEditorWidth] = useState(460);
  const [resizing, setResizing] = useState<ResizeHandle | null>(null);
  const [plannerEntered, setPlannerEntered] = useState(hasAnyLegs);
  const [catalogRequested, setCatalogRequested] = useState(false);
  const [nextLegMapGuide, setNextLegMapGuide] = useState<NextLegMapGuide | null>(null);
  const [nextLegSelection, setNextLegSelection] = useState<{ origin: string; to: string } | null>(null);
  // Existing/shared routes open normally. Guided collapse is triggered only
  // after the user explicitly chooses/extends the route in this session.
  const [routeSetupExpanded, setRouteSetupExpanded] = useState(true);
  const [guidedFocusVersion, setGuidedFocusVersion] = useState(0);
  const routeNextStepRef = useRef<HTMLElement>(null);
  const rtwProducts = useMemo(
    () => sortMileageRedemptionRtwProductsForMarket(data.rtwRuleCatalog.products, data.marketProfile),
    [data.rtwRuleCatalog.products, data.marketProfile],
  );

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
  // Discovery must use the actual product's operator pool, not every member
  // of its alliance. The eligibility helper includes catalog-backed names.
  const explorerCarriers = useMemo(
    () => eligibleAirlines.map((airline) => ({ code: airline.iata, name: airline.name })),
    [eligibleAirlines],
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

  function enterPlan(productId: string): void {
    if (!rtwProducts.some((product) => product.id === productId && product.status === 'active')) return;
    setRouting({ ...routing, rtwProductId: productId });
    setCatalogRequested(false);
    setPlannerEntered(true);
  }

  useEffect(() => {
    if (resizing === null) return;
    function onMove(event: PointerEvent): void {
      const minSide = 340;
      const maxSide = Math.min(560, Math.max(380, window.innerWidth * 0.45));
      setEditorWidth(Math.min(maxSide, Math.max(minSide, event.clientX)));
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

  function guideToNextLeg(): void {
    setRouteSetupExpanded(false);
    setGuidedFocusVersion((version) => version + 1);
  }

  function addAirport(a: Airport): void {
    // Empty group: buffer the first airport, or promote pending + new → leg.
    if (activeGroup.legs.length === 0) {
      if (!pendingAirport) {
        setPendingFor(safeActiveIndex, a);
        guideToNextLeg();
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
      guideToNextLeg();
      return;
    }
    // Has legs: append to the end as usual.
    updateActiveGroup((group) => {
      const from = group.legs.at(-1)?.to;
      if (!from || from === a.iata) return group;
      return { legs: [...group.legs, {
        from, to: a.iata,
        operatingCarrier: defaultCarrier(group.legs, selectedRtwProduct, data, preferredEligibleCarrier),
      }] };
    });
    guideToNextLeg();
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
      const nextLegs = reindexLegs(
        group.legs,
        codes.map((_, i) => i).filter((i) => i !== index),
        defaultCarrier(group.legs, selectedRtwProduct, data, preferredEligibleCarrier),
      );
      return { legs: nextLegs };
    });
  }

  function reorder(airportOrder: ReadonlyArray<number>): void {
    updateActiveGroup((group) => {
      const nextLegs = reindexLegs(
        group.legs,
        airportOrder,
        defaultCarrier(group.legs, selectedRtwProduct, data, preferredEligibleCarrier),
      );
      return { legs: nextLegs };
    });
  }

  function changeCarrier(legIndex: number, carrier: AirlineIata): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => {
        if (i !== legIndex || !isFlightLeg(leg) || leg.operatingCarrier === carrier) return leg;
        return { ...clearLegField(leg, 'flightNumber'), operatingCarrier: carrier };
      }),
    }));
  }

  /**
   * Destinations-panel click-through. The panel only enables chips that can
   * legally attach (fresh chain / matching pending airport / chain end), so
   * this trusts its caller: empty group starts at from→to directly, any
   * other enabled case appends `to` through the normal airport path.
   */
  function addExplorerPair(from: Iata, to: Iata, carrier: AirlineIata, selection?: {
    departsOn?: string;
    flightNumber?: string;
    cabin?: CabinId;
    stopover?: boolean;
    manual?: boolean;
  }): void {
    // Validate attachment here as well as disabling incompatible UI chips.
    const chainEnd = activeGroup.legs.at(-1)?.to ?? pendingAirport?.iata;
    if (from === to || (chainEnd !== undefined && chainEnd !== from)) return;
    if (!airportIndex.lookup(from) || !airportIndex.lookup(to)) return;
    if (!isCarrierEligibleForProduct(carrier, selectedRtwProduct, data.allianceCatalog)) return;
    if (selection?.departsOn !== undefined && !isCalendarDate(selection.departsOn)) return;
    if (selection?.flightNumber !== undefined && !/^\d{1,4}[A-Z]?$/.test(selection.flightNumber)) return;
    const newLeg: FlightLeg = { from, to, operatingCarrier: carrier, ...selection };
    if (activeGroup.legs.length === 0) {
      updateActiveGroup(() => ({
        legs: [newLeg],
      }));
      setPendingFor(safeActiveIndex, undefined);
      setNextLegSelection(null);
      guideToNextLeg();
      return;
    }
    updateActiveGroup((group) => ({
      legs: [...group.legs, newLeg],
    }));
    setNextLegSelection(null);
    guideToNextLeg();
  }

  function addSurfacePair(from: Iata, to: Iata, stopover?: boolean): void {
    const chainEnd = activeGroup.legs.at(-1)?.to ?? pendingAirport?.iata;
    if (from === to || (chainEnd !== undefined && chainEnd !== from)) return;
    if (!airportIndex.lookup(from) || !airportIndex.lookup(to)) return;
    const newLeg: SurfaceLeg = {
      from,
      to,
      surface: true,
      ...(stopover !== undefined ? { stopover } : {}),
    };
    if (activeGroup.legs.length === 0) {
      updateActiveGroup(() => ({ legs: [newLeg] }));
      setPendingFor(safeActiveIndex, undefined);
    } else {
      updateActiveGroup((group) => ({ legs: [...group.legs, newLeg] }));
    }
    setNextLegSelection(null);
    guideToNextLeg();
  }

  function changeFareClass(legIndex: number, fareClass: string | undefined): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => {
        if (i !== legIndex || !isFlightLeg(leg)) return leg;
        if (fareClass === undefined) {
          // Strip the field rather than store undefined — keeps URL clean.
          return clearLegField(leg, 'fareClass');
        }
        return { ...leg, fareClass };
      }),
    }));
  }

  function changeCabin(legIndex: number, cabin: CabinId | undefined): void {
    const nextGroups = routing.groups.map((group, groupIndex) => {
      if (groupIndex !== safeActiveIndex) return group;
      return {
        legs: group.legs.map((leg, i) => {
          if (i !== legIndex || !isFlightLeg(leg)) return leg;
          return cabin === undefined ? clearLegField(leg, 'cabin') : { ...leg, cabin };
        }),
      };
    });
    const rank: Record<CabinId, number> = {
      economy: 0,
      'premium-economy': 1,
      business: 2,
      first: 3,
    };
    const explicitCabins = nextGroups.flatMap((group) => group.legs)
      .filter(isFlightLeg)
      .map((leg) => leg.cabin)
      .filter((value): value is CabinId => value !== undefined);
    const highest = explicitCabins.reduce<CabinId | undefined>((best, value) =>
      best === undefined || rank[value] > rank[best] ? value : best, undefined);
    setRouting({ ...routing, groups: nextGroups, cabin: highest ?? routing.cabin });
  }

  function changeStopover(legIndex: number, stopover: boolean | undefined): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => {
        if (i !== legIndex) return leg;
        if (stopover === undefined) {
          return clearLegField(leg, 'stopover');
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
          if (isFlightLeg(leg)) return leg;
          return {
            from: leg.from,
            to: leg.to,
            operatingCarrier: defaultCarrier(group.legs, selectedRtwProduct, data, preferredEligibleCarrier),
            ...(leg.stopover !== undefined ? { stopover: leg.stopover } : {}),
          } satisfies FlightLeg;
        }
        if (isSurfaceLeg(leg)) return leg;
        return {
          from: leg.from,
          to: leg.to,
          surface: true,
          ...(leg.stopover !== undefined ? { stopover: leg.stopover } : {}),
        } satisfies SurfaceLeg;
      }),
    }));
  }

  function changeLegDate(legIndex: number, departsOn: string | undefined): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => {
        if (i !== legIndex || !isFlightLeg(leg) || departsOn === leg.departsOn) return leg;
        if (departsOn === undefined) {
          return clearLegField(leg, 'departsOn');
        }
        // A flight designator may be selected before the date. Preserve it
        // here and let the date/time query verify whether that exact flight
        // operates on the newly chosen date.
        return { ...leg, departsOn };
      }),
    }));
  }

  function selectExistingFlight(legIndex: number, flight: FlightSelection): void {
    if (!isCarrierEligibleForProduct(flight.carrier, selectedRtwProduct, data.allianceCatalog)) return;
    updateActiveGroup((group) => ({ legs: group.legs.map((leg, i) =>
      i === legIndex && isFlightLeg(leg) && leg.from === flight.from && leg.to === flight.to
        ? { ...leg, operatingCarrier: flight.carrier, departsOn: selectedDepartureDate(flight), flightNumber: flight.flightNumber }
        : leg) }));
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
      setCatalogRequested(false);
      setPlannerEntered(true);
      setRouteSetupExpanded(false);
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
    setCatalogRequested(false);
    setPlannerEntered(true);
    setRouteSetupExpanded(false);
  }

  function clearAll(): void {
    setRouting({ ...routing, groups: [{ legs: [] }] });
    setActiveGroupIndex(0);
    setPendingByGroup(new Map());
    setNextLegSelection(null);
    setRouteSetupExpanded(true);
  }

  function addGroup(): void {
    const nextGroups = [...routing.groups, { legs: [] }];
    setRouting({ ...routing, groups: nextGroups });
    setActiveGroupIndex(nextGroups.length - 1);
    setRouteSetupExpanded(true);
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

  const showSamples = !hasAnyLegs;
  const routeSetupSummary = activeChainAirports.map((airport) => airport.iata).join(' → ');
  const currentRouteEndpoint = activeChainAirports.at(-1)?.iata ?? '';
  const routeSetupCanCollapse = currentRouteEndpoint !== '';

  useEffect(() => {
    if (guidedFocusVersion === 0) return;
    const nextStep = routeNextStepRef.current;
    nextStep?.focus({ preventScroll: true });
    nextStep?.scrollIntoView?.({ block: 'start' });
  }, [guidedFocusVersion]);

  function toggleInspector(panel: InspectorPanel): void {
    if (inspectorOpen && activeInspector === panel) {
      setInspectorOpen(false);
      return;
    }
    setActiveInspector(panel);
    setInspectorOpen(true);
  }

  const showPlanner = plannerEntered || (hasAnyLegs && !catalogRequested);

  if (!showPlanner) {
    return (
      <div className={`app app-gate${isMobile ? ' mobile' : ''}`}>
        <header className="app-header">
          <div className="app-brand">
            <span className="app-brand-name">gcmp</span>
            <span className="app-brand-tagline">{t('brand.tagline')}</span>
          </div>
          <div className="app-header-controls"><LanguagePicker /></div>
        </header>
        {routingError && <div className="app-banner app-banner-warn" role="alert">⚠ {routingError}</div>}
        <RtwPlanGate
          products={rtwProducts}
          ticketingPrograms={data.rtwRuleCatalog.ticketingPrograms}
          allianceCatalog={data.allianceCatalog}
          routeNetwork={data.routeNetwork}
          routeCountsByCarrier={data.routeNetworkCounts}
          routeNetworkDetailsUrl={data.routeNetworkRuntimeUrl}
          schedules={data.schedules}
          officialSchedules={data.officialSchedules}
          airportLookup={airportIndex.byIata}
          countryContinents={data.countryContinents}
          airportContinentOverrides={data.airportContinentOverrides}
          marketProfile={data.marketProfile}
          initialProductId={routing.rtwProductId}
          onContinue={enterPlan}
        />
      </div>
    );
  }

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
        } as React.CSSProperties}
      >
        <section className="route-editor" aria-label="Routing input">
          <div className="route-editor-scroll">
            <div className="route-plan-bar">
              <div>
                <span>{t('rtw.onboarding.currentPlan')}</span>
                <strong>{selectedRtwProduct?.label ?? t('rtw.noProducts')}</strong>
              </div>
              <button type="button" onClick={() => {
                setInspectorOpen(false);
                setCatalogRequested(true);
                setPlannerEntered(false);
              }}>{t('rtw.onboarding.changePlan')}</button>
            </div>
            <section className={`route-setup-stage${routeSetupCanCollapse && !routeSetupExpanded ? ' is-collapsed' : ' is-expanded'}`}>
              {routeSetupCanCollapse && !routeSetupExpanded ? (
                <button
                  type="button"
                  className="route-setup-summary"
                  data-route-setup-collapsed="true"
                  onClick={() => setRouteSetupExpanded(true)}
                >
                  <span className="route-setup-summary-copy">
                    <small>{t('rtw.workflow.routeSetupSummary')}</small>
                    <strong>{routeSetupSummary}</strong>
                    <em>{t('rtw.workflow.continueFrom', { origin: currentRouteEndpoint })}</em>
                  </span>
                  <span className="route-setup-summary-action">{t('rtw.workflow.editRouteSetup')}</span>
                </button>
              ) : (
                <>
                  <div className="route-editor-step">
                    <div>
                      <p className="rtw-eyebrow">{t('rtw.workflow.routeStep')}</p>
                      <h2>{t('rtw.workflow.routeTitle')}</h2>
                    </div>
                    <p>{t('rtw.workflow.routeHint')}</p>
                  </div>
                  {!isMobile && (
                    <AirportAutocomplete index={airportIndex} onCommit={addAirport} />
                  )}
                  <Suspense fallback={null}>
                    <LazySeasonalItineraryFinder
                      productId={selectedRtwProductId}
                      templateUrl={`${import.meta.env.BASE_URL}data/rtw-seasonal/eva-star-w26.json`}
                      initialStartDate={routing.startDate}
                      onApply={(seasonal) => {
                        const legs: Leg[] = seasonalItineraryLegs(seasonal);
                        setRouting({
                          ...routing,
                          groups: [{ legs }],
                          rtwProductId: selectedRtwProductId,
                          startDate: seasonal.actualStartDate,
                          endDate: seasonal.endDate,
                        });
                        setActiveGroupIndex(0);
                        setPendingByGroup(new Map());
                        setNextLegSelection(null);
                        setNextLegMapGuide(null);
                        setRouteSetupExpanded(true);
                      }}
                    />
                  </Suspense>
                  {showSamples && (
                    <details className="route-editor-details route-examples-details">
                      <summary>{t('rtw.workflow.examples')}</summary>
                      <div className="route-detail-stack">
                        <Suspense fallback={null}>
                          <LazySampleRoutings onSelect={loadExternalRouting} />
                        </Suspense>
                      </div>
                    </details>
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
                    legs={activeGroup.legs}
                    airlines={eligibleAirlines}
                    onReorder={reorder}
                    onRemove={removeAirport}
                    onCarrierChange={changeCarrier}
                    onCabinChange={changeCabin}
                    onFareClassChange={changeFareClass}
                    onStopoverChange={changeStopover}
                    onSurfaceChange={changeSurface}
                  />
                  <div className="route-editor-secondary">
                    {hasAnyLegs && (
                      <details className="route-editor-details route-flight-details">
                        <summary>
                          <span>{t('rtw.workflow.flightDetails')}</span>
                          <small>{t('rtw.workflow.flightDetailsHint')}</small>
                        </summary>
                        <div className="route-detail-stack">
                          <RtwTripDates
                            startDate={routing.startDate}
                            endDate={routing.endDate}
                            onChange={changeTripDates}
                          />
                          <RtwLegTable
                            key={safeActiveIndex}
                            airports={activeChainAirports}
                            legs={activeGroup.legs}
                            onFlightSelect={selectExistingFlight}
                            schedules={data.schedules}
                            officialSchedules={data.officialSchedules}
                            airlines={eligibleAirlines}
                            onCarrierChange={changeCarrier}
                            onStopoverChange={changeStopover}
                            onSurfaceChange={changeSurface}
                            onDateChange={changeLegDate}
                          />
                        </div>
                      </details>
                    )}
                  </div>
                  {routeSetupCanCollapse && (
                    <button type="button" className="route-setup-continue" onClick={guideToNextLeg}>
                      {t('rtw.workflow.collapseAndContinue', { origin: currentRouteEndpoint })}
                    </button>
                  )}
                </>
              )}
            </section>
            <section
              ref={routeNextStepRef}
              className="route-next-step"
              aria-label={t('rtw.workflow.explore')}
              tabIndex={-1}
            >
              <DestinationsPanel
                key={`${selectedRtwProductId}:${safeActiveIndex}`}
                airports={data.airports}
                schedules={data.schedules ?? []}
                officialSchedules={data.officialSchedules}
                network={data.routeNetwork}
                runtimeNetworkShardBaseUrl={data.routeNetworkOriginShardBaseUrl}
                networkGaps={data.networkGaps}
                carriers={explorerCarriers}
                chainEnd={activeChainAirports.at(-1)?.iata}
                pendingIata={pendingAirport?.iata}
                lookupAirport={airportIndex.lookup}
                onAddPair={addExplorerPair}
                onAddSurface={addSurfacePair}
                onMapGuideChange={setNextLegMapGuide}
                selectedDestination={
                  nextLegSelection?.origin === (activeChainAirports.at(-1)?.iata ?? pendingAirport?.iata)
                    ? nextLegSelection?.to ?? null
                    : null
                }
                onDestinationChange={(to) => {
                  const origin = activeChainAirports.at(-1)?.iata ?? pendingAirport?.iata;
                  setNextLegSelection(origin && to ? { origin, to } : null);
                  if (to) guideToNextLeg();
                }}
              />
            </section>
          </div>
          {hasAnyLegs && (
            <div className="route-editor-footer">
              <button type="button" className="route-review-button" onClick={() => toggleInspector('rules')}>
                {t('rtw.workflow.review')}
              </button>
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
            <label className="map-toggle">
              <input
                type="checkbox"
                checked={showDistances}
                onChange={(e) => setShowDistances(e.target.checked)}
              />
              {t('distances.show')}
            </label>
            {([
              ['rules', '✓', t('rtw.inspectorRules')],
              ['tools', '＋', t('rtw.inspectorTools')],
              ['saved', '□', t('rtw.inspectorSaved')],
            ] as const).map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                className={`map-panel-button${inspectorOpen && activeInspector === id ? ' active' : ''}`}
                aria-expanded={inspectorOpen && activeInspector === id}
                aria-controls="route-inspector"
                onClick={() => toggleInspector(id)}
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          <MapErrorBoundary groups={routing.groups}>
            <Suspense fallback={<div className="app-map-loading" aria-hidden="true" />}>
              <LazyMapView
                key={routing.projection ?? DEFAULT_PROJECTION}
                airportLookup={airportIndex.byIata}
                airports={data.airports}
                activeAirports={activeChainAirports}
                groups={routing.groups}
                activeIndex={safeActiveIndex}
                width={mapSize.width}
                height={mapSize.height}
                projection={routing.projection ?? DEFAULT_PROJECTION}
                showDistances={showDistances}
                onAirportCommit={addAirport}
                nextLegGuide={nextLegMapGuide}
                selectedNextStop={
                  nextLegSelection?.origin === nextLegMapGuide?.origin ? nextLegSelection?.to ?? null : null
                }
                onNextLegSelect={(to) => {
                  setNextLegSelection(nextLegMapGuide && to ? { origin: nextLegMapGuide.origin, to } : null);
                }}
              />
            </Suspense>
          </MapErrorBoundary>
        </div>
        <aside
          id="route-inspector"
          className={`app-panel${inspectorOpen ? ' open' : ''}`}
          aria-label="Route inspector"
          aria-hidden={!inspectorOpen}
        >
          <div className="inspector-head">
            <strong>{t('rtw.workflow.review')}</strong>
            <button
              type="button"
              className="inspector-close"
              aria-label={t('rtw.workflow.closeInspector')}
              onClick={() => setInspectorOpen(false)}
            >
              ×
            </button>
          </div>
          <nav className="inspector-tabs" aria-label="Route inspector sections">
            {([
              ['rules', '✓', t('rtw.inspectorRules')],
              ['tools', '＋', t('rtw.inspectorTools')],
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
                schedules={data.schedules}
                ciZones={data.ciZones}
                selectedProductId={selectedRtwProductId}
              />
            )}
            {activeInspector === 'tools' && (
              <div className="inspector-stack">
                <Suspense fallback={null}>
                  <LazyImportFromGcmap onImport={loadExternalRouting} />
                </Suspense>
              </div>
            )}
            {activeInspector === 'saved' && (
              <Suspense fallback={null}>
                <LazySavedRoutings saved={saved} onLoad={loadSaved} onDelete={remove} />
              </Suspense>
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

function defaultCarrier(
  legs: ReadonlyArray<Leg>,
  selectedProduct: ReadyProps['data']['rtwRuleCatalog']['products'][number] | undefined,
  data: ReadyProps['data'],
  preferredEligibleCarrier: AirlineIata,
): AirlineIata {
  const firstCarrier = legs.find(isFlightLeg)?.operatingCarrier;
  if (
    firstCarrier !== undefined &&
    isCarrierEligibleForProduct(firstCarrier, selectedProduct, data.allianceCatalog)
  ) {
    return firstCarrier;
  }
  return preferredEligibleCarrier;
}
