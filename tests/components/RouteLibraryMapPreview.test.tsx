import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, test } from 'vitest';
import { RouteLibraryMapPreview } from '../../src/components/RouteLibraryMapPreview.tsx';
import type { RouteLibraryRouteCard } from '../../src/lib/rtw/route-library-entities.ts';
import type { Airport } from '../../src/lib/types.ts';

const TPE: Airport = { iata: 'TPE', name: 'Taiwan Taoyuan International Airport', city: 'Taoyuan', country: 'TW', lat: 25.0777, lon: 121.2328 };
const NRT: Airport = { iata: 'NRT', name: 'Narita International Airport', city: 'Narita', country: 'JP', lat: 35.772, lon: 140.3929 };

function route(from: Airport, to: Airport): RouteLibraryRouteCard {
  return {
    from,
    to,
    distanceNm: 1178,
    carriers: [{ carrier: 'BR', name: 'EVA Air', identity: 'operating', confirmedNumbers: ['BR198'], candidateNumbers: [], sources: [] }],
  };
}

describe('RouteLibraryMapPreview', () => {
  test('shows real route geometry and stats before MapLibre is ready', () => {
    const result = render(<RouteLibraryMapPreview
      zh
      routes={[route(TPE, NRT)]}
      stats={[
        { value: '1,178 nm', label: '大圓距離' },
        { value: 1, label: '航空公司' },
      ]}
    />);

    const preview = screen.getByRole('status');
    expect(preview).toHaveAttribute('data-map-preview', 'true');
    expect(screen.getByText('航網資料已就緒')).toBeInTheDocument();
    expect(screen.getByText('正在啟動互動地圖…')).toBeInTheDocument();
    expect(screen.getByText('1,178 nm')).toBeInTheDocument();
    expect(screen.getByText('大圓距離')).toBeInTheDocument();
    expect(result.container.querySelectorAll('.entity-map-preview-routes path')).toHaveLength(1);
    expect(result.container.querySelectorAll('.entity-map-preview-airports circle')).toHaveLength(2);
  });

  test('bounds large networks to a small deterministic SVG sample', () => {
    const routes = Array.from({ length: 240 }, (_, index) => route(TPE, {
      ...NRT,
      iata: `X${String(index).padStart(2, '0')}`,
      lon: -170 + (index % 120) * 2.8,
      lat: -45 + (index % 70) * 1.6,
    }));
    const result = render(<RouteLibraryMapPreview zh={false} routes={routes} stats={[]} />);
    const routePaths = result.container.querySelectorAll('.entity-map-preview-routes path');
    const airportPoints = result.container.querySelectorAll('.entity-map-preview-airports circle');
    expect(routePaths.length).toBeGreaterThan(0);
    expect(routePaths.length).toBeLessThanOrEqual(192);
    expect(airportPoints.length).toBeLessThanOrEqual(72);
    expect(screen.getByText('Network data is ready')).toBeInTheDocument();
  });
});
