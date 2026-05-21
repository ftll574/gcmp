/**
 * gcmp — Mileage Runner Routing Calculator
 *
 * v0.4: multi-group routings. Each group has its own legs[]; cabin + programs
 * + projection are global. The map renders all groups color-coded; the leg
 * chain edits the currently-active group.
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
import { ModeToggle } from './components/ModeToggle.tsx';
import { ProjectionPicker } from './components/ProjectionPicker.tsx';
import { SampleRoutings } from './components/SampleRoutings.tsx';
import { SavedRoutings } from './components/SavedRoutings.tsx';
import { useLocale } from './i18n/use-locale.ts';
import { buildAirportIndex } from './lib/airport-index.ts';
import { computeRouting } from './lib/calc/index.ts';
import { DEFAULT_PROJECTION, type ProjectionId } from './lib/calc/projections.ts';
import { downloadBlob, svgToPngBlob } from './lib/svg-to-png.ts';
import { parseShareUrl } from './lib/url-schema.ts';
import {
  PROGRAM_LABELS,
  type AirlineIata,
  type Airport,
  type CabinId,
  type Iata,
  type Leg,
  type ProgramId,
  type RoutingGroup,
  type RoutingRequest,
} from './lib/types.ts';
import type { LoadedData } from './state/use-loaded-data.ts';
import { useLoadedData } from './state/use-loaded-data.ts';
import { useAppMode } from './state/use-mode.ts';
import { useRoutingState } from './state/use-routing-state.ts';
import { useSavedRoutings } from './state/use-saved-routings.ts';
import { useViewportWidth } from './state/use-viewport.ts';
import './App.css';

const MOBILE_BREAKPOINT = 768;

export function App(): React.ReactElement {
  const { t } = useLocale();
  const load = useLoadedData();
  const { state: routing, setRouting, shareUrl } = useRoutingState();
  const { saved, save, remove, lastError: saveError } = useSavedRoutings();
  const { mode, setMode } = useAppMode();
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
      mode={mode}
      setMode={setMode}
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
  mode: ReturnType<typeof useAppMode>['mode'];
  setMode: ReturnType<typeof useAppMode>['setMode'];
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
  mode,
  setMode,
  isMobile,
  mapRef,
  mapSize,
  shareUrl,
}: ReadyProps): React.ReactElement {
  const { t } = useLocale();
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [showBearings, setShowBearings] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const airportIndex = useMemo(() => buildAirportIndex(data.airports), [data.airports]);

  // Clamp active group when groups change.
  const safeActiveIndex = Math.min(activeGroupIndex, Math.max(0, routing.groups.length - 1));

  const activeGroup = useMemo<RoutingGroup>(
    () => routing.groups[safeActiveIndex] ?? { legs: [] },
    [routing.groups, safeActiveIndex],
  );

  // Active group's airport chain (resolved).
  const activeChainAirports = useMemo<Airport[]>(() => {
    if (activeGroup.legs.length === 0) return [];
    const first = activeGroup.legs[0]?.from;
    if (!first) return [];
    const codes: Iata[] = [first, ...activeGroup.legs.map((leg) => leg.to)];
    return codes
      .map((code) => airportIndex.lookup(code))
      .filter((a): a is Airport => a !== undefined);
  }, [activeGroup, airportIndex]);

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

  function addAirport(a: Airport): void {
    updateActiveGroup((group) => {
      const codes = activeChainAirports.map((x) => x.iata);
      const nextCodes = [...codes, a.iata];
      const nextLegs = buildLegs(nextCodes, group.legs, defaultCarrier(group.legs));
      return { legs: nextLegs };
    });
  }

  function removeAirport(_iata: Iata, index: number): void {
    updateActiveGroup((group) => {
      const codes = activeChainAirports.map((x) => x.iata);
      const nextCodes = codes.filter((_, i) => i !== index);
      if (nextCodes.length < 2) return { legs: [] };
      const nextLegs = buildLegs(nextCodes, group.legs, defaultCarrier(group.legs));
      return { legs: nextLegs };
    });
  }

  function reorder(nextCodes: ReadonlyArray<Iata>): void {
    updateActiveGroup((group) => {
      if (nextCodes.length < 2) return { legs: [] };
      const nextLegs = buildLegs(nextCodes, group.legs, defaultCarrier(group.legs));
      return { legs: nextLegs };
    });
  }

  function changeCarrier(legIndex: number, carrier: AirlineIata): void {
    updateActiveGroup((group) => ({
      legs: group.legs.map((leg, i) => (i === legIndex ? { ...leg, operatingCarrier: carrier } : leg)),
    }));
  }

  function changeCabin(cabin: CabinId): void {
    setRouting({ ...routing, cabin });
  }

  function changeProjection(projection: ProjectionId): void {
    setRouting({ ...routing, projection });
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
      setRouting(parsed.request);
      setActiveGroupIndex(0);
    }
  }

  function clearAll(): void {
    setRouting({ ...routing, groups: [{ legs: [] }] });
    setActiveGroupIndex(0);
  }

  async function downloadPng(): Promise<void> {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg, 2);
      const chain = routing.groups
        .map((g) => g.legs.map((l) => l.from).concat([g.legs[g.legs.length - 1]?.to ?? '']).filter(Boolean).join('-'))
        .filter(Boolean)
        .join('_');
      const filename = chain ? `${t('download.filename')}-${chain}.png` : `${t('download.filename')}.png`;
      downloadBlob(blob, filename);
    } catch (e) {
      console.error('PNG export failed:', e);
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
  }

  const hasAnyLegs = routing.groups.some((g) => g.legs.length > 0);
  const showSamples = mode === 'beginner' && !hasAnyLegs;

  return (
    <div className={`app${isMobile ? ' mobile' : ''} mode-${mode}`}>
      <MobileBanner visible={isMobile} />
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-name">gcmp</span>
          <span className="app-brand-tagline">{t('brand.tagline')}</span>
        </div>
        <div className="app-header-controls">
          <ModeToggle mode={mode} onChange={setMode} />
          <LanguagePicker />
          <ActionRow
            shareUrl={shareUrl}
            canSave={hasAnyLegs}
            onSave={(name) => {
              if (shareUrl) save(name, shareUrl);
            }}
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
      <section className="app-input" aria-label="Routing input">
        {!isMobile && (
          <AirportAutocomplete index={airportIndex} onCommit={addAirport} mode={mode} />
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
          airlines={data.airlines}
          onReorder={reorder}
          onRemove={removeAirport}
          onCarrierChange={changeCarrier}
        />
        {hasAnyLegs && (
          <div className="app-controls">
            <div className="app-controls-group">
              <span className="app-controls-label">
                <Glossary term="cabin" mode={mode}>
                  {t('cabin.label')}
                </Glossary>
              </span>
              <CabinSelector value={routing.cabin} onChange={changeCabin} mode={mode} />
            </div>
            <div className="app-controls-group">
              <span className="app-controls-label">
                <Glossary term="credit" mode={mode}>
                  {t('panel.pqmLong')} / {t('panel.rdmLong')}
                </Glossary>
              </span>
              <ProgramToggle
                programs={['aa-aadvantage', 'as-mileage-plan']}
                active={routing.programs}
                onToggle={toggleProgram}
              />
            </div>
            <button type="button" className="app-clear" onClick={clearAll}>
              {t('input.clearAll')}
            </button>
          </div>
        )}
      </section>
      <main className="app-body">
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
            {hasAnyLegs && (
              <button type="button" className="map-download" onClick={() => { void downloadPng(); }}>
                {t('download.png')}
              </button>
            )}
          </div>
          <MapErrorBoundary groups={routing.groups}>
            <MapView
              key={routing.projection ?? DEFAULT_PROJECTION}
              airportLookup={airportIndex.byIata}
              groups={routing.groups}
              activeIndex={safeActiveIndex}
              width={mapSize.width}
              height={mapSize.height}
              projection={routing.projection ?? DEFAULT_PROJECTION}
              showBearings={showBearings}
              onSvgReady={(el) => {
                svgRef.current = el;
              }}
            />
          </MapErrorBoundary>
        </div>
        <aside className="app-panel" aria-label="Earning panel">
          {showSamples && (
            <>
              <SampleRoutings onSelect={(r) => { setRouting(r); setActiveGroupIndex(0); }} />
              <ImportFromGcmap onImport={(r) => { setRouting(r); setActiveGroupIndex(0); }} />
            </>
          )}
          <EarningPanel
            result={result}
            programOrder={routing.programs}
            mode={mode}
            cabin={routing.cabin}
          />
          <SavedRoutings saved={saved} onLoad={loadSaved} onDelete={remove} />
        </aside>
      </main>
      <footer className="app-footer">
        <span>{t('footer.openSource')}</span>
        <span className="app-footer-note">{t('footer.disclaimer')}</span>
      </footer>
    </div>
  );
}

interface ProgramToggleProps {
  programs: ReadonlyArray<ProgramId>;
  active: ReadonlyArray<ProgramId>;
  onToggle: (id: ProgramId) => void;
}

function ProgramToggle({ programs, active, onToggle }: ProgramToggleProps): React.ReactElement {
  return (
    <div className="program-toggle" aria-label="Loyalty programs">
      {programs.map((id) => {
        const on = active.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`program-toggle-button${on ? ' active' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(id)}
          >
            {PROGRAM_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}

function defaultCarrier(legs: ReadonlyArray<Leg>): AirlineIata {
  return legs[0]?.operatingCarrier ?? 'AA';
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
    const carrier = prev && prev.from === from && prev.to === to
      ? prev.operatingCarrier
      : defaultOp;
    legs.push({ from, to, operatingCarrier: carrier });
  }
  return legs;
}
