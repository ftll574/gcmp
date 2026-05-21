/**
 * gcmp — Mileage Runner Routing Calculator
 *
 * Top bar: brand + language picker + mode toggle + Save / Share
 * Input row: autocomplete + leg chain + cabin + program toggles
 * Body: map (left) + earning panel (right)
 * Empty-state in Beginner mode: sample-routings carousel
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionRow } from './components/ActionRow.tsx';
import { AirportAutocomplete } from './components/AirportAutocomplete.tsx';
import { CabinSelector } from './components/CabinSelector.tsx';
import { EarningPanel } from './components/EarningPanel.tsx';
import { Glossary } from './components/Glossary.tsx';
import { LanguagePicker } from './components/LanguagePicker.tsx';
import { LegChain } from './components/LegChain.tsx';
import { MapErrorBoundary } from './components/MapErrorBoundary.tsx';
import { MapView } from './components/MapView.tsx';
import { MobileBanner } from './components/MobileBanner.tsx';
import { ModeToggle } from './components/ModeToggle.tsx';
import { SampleRoutings } from './components/SampleRoutings.tsx';
import { SavedRoutings } from './components/SavedRoutings.tsx';
import { useLocale } from './i18n/use-locale.ts';
import { buildAirportIndex } from './lib/airport-index.ts';
import { computeRouting } from './lib/calc/index.ts';
import { parseShareUrl } from './lib/url-schema.ts';
import {
  PROGRAM_LABELS,
  type AirlineIata,
  type Airport,
  type CabinId,
  type Iata,
  type Leg,
  type ProgramId,
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
  const airportIndex = useMemo(() => buildAirportIndex(data.airports), [data.airports]);

  const chainAirports = useMemo<Airport[]>(() => {
    if (routing.legs.length === 0) return [];
    const first = routing.legs[0]?.from;
    if (!first) return [];
    const codes: Iata[] = [first, ...routing.legs.map((leg) => leg.to)];
    return codes
      .map((code) => airportIndex.lookup(code))
      .filter((a): a is Airport => a !== undefined);
  }, [airportIndex, routing.legs]);

  const result = useMemo(() => {
    if (routing.legs.length === 0) return null;
    return computeRouting(routing, {
      airports: airportIndex.byIata,
      programs: data.programs,
    });
  }, [routing, airportIndex, data.programs]);

  function addAirport(a: Airport): void {
    const codes = chainAirports.map((x) => x.iata);
    const nextCodes = [...codes, a.iata];
    const nextLegs = buildLegs(nextCodes, routing.legs, defaultCarrier(routing.legs));
    setRouting({ ...routing, legs: nextLegs });
  }

  function removeAirport(_iata: Iata, index: number): void {
    const codes = chainAirports.map((x) => x.iata);
    const nextCodes = codes.filter((_, i) => i !== index);
    if (nextCodes.length < 2) {
      setRouting({ ...routing, legs: [] });
      return;
    }
    const nextLegs = buildLegs(nextCodes, routing.legs, defaultCarrier(routing.legs));
    setRouting({ ...routing, legs: nextLegs });
  }

  function reorder(nextCodes: ReadonlyArray<Iata>): void {
    if (nextCodes.length < 2) {
      setRouting({ ...routing, legs: [] });
      return;
    }
    const nextLegs = buildLegs(nextCodes, routing.legs, defaultCarrier(routing.legs));
    setRouting({ ...routing, legs: nextLegs });
  }

  function changeCarrier(legIndex: number, carrier: AirlineIata): void {
    const nextLegs = routing.legs.map((leg, i) =>
      i === legIndex ? { ...leg, operatingCarrier: carrier } : leg,
    );
    setRouting({ ...routing, legs: nextLegs });
  }

  function changeCabin(cabin: CabinId): void {
    setRouting({ ...routing, cabin });
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
    }
  }

  function clearAll(): void {
    setRouting({ ...routing, legs: [] });
  }

  const showSamples = mode === 'beginner' && routing.legs.length === 0;

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
            canSave={routing.legs.length > 0}
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
        <LegChain
          airports={chainAirports}
          operatingCarriers={routing.legs.map((leg) => leg.operatingCarrier)}
          airlines={data.airlines}
          onReorder={reorder}
          onRemove={removeAirport}
          onCarrierChange={changeCarrier}
        />
        {routing.legs.length > 0 && (
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
          <MapErrorBoundary airports={chainAirports} legs={routing.legs}>
            <MapView
              airports={chainAirports}
              legs={routing.legs}
              width={mapSize.width}
              height={mapSize.height}
            />
          </MapErrorBoundary>
        </div>
        <aside className="app-panel" aria-label="Earning panel">
          {showSamples && <SampleRoutings onSelect={setRouting} />}
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
