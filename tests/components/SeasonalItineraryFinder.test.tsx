import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { SeasonalItineraryFinder } from '../../src/components/SeasonalItineraryFinder.tsx';
import { SeasonalRtwTemplateSchema } from '../../src/lib/schemas/rtw-seasonal.ts';

const template = SeasonalRtwTemplateSchema.parse(JSON.parse(
  readFileSync('public/data/rtw-seasonal/eva-star-w26.json', 'utf8'),
));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SeasonalItineraryFinder', () => {
  test('progressively reveals a complete itinerary and applies it explicitly', () => {
    const onApply = vi.fn();
    render(<SeasonalItineraryFinder
      productId={template.productId}
      templateUrl="/unused.json"
      templateOverride={template}
      initialStartDate="2026-12-05"
      onApply={onApply}
    />);
    expect(screen.queryByText('2026-12-05')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Classic route|經典路線/));
    fireEvent.click(screen.getByRole('button', { name: /Find a schedulable itinerary|找一組班表可行日期/ }));
    expect(document.querySelectorAll('[data-seasonal-flight]')).toHaveLength(8);
    expect(document.querySelector('[data-seasonal-flight="UA2303:2026-12-09"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Apply and replace current itinerary|套用並取代目前行程/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ ok: true, requestedStartDate: '2026-12-05' });
  });

  test('shows an honest failure for a start date that cannot fit the season', () => {
    render(<SeasonalItineraryFinder
      productId={template.productId}
      templateUrl="/unused.json"
      templateOverride={template}
      initialStartDate="2027-03-20"
      onApply={() => {}}
    />);
    fireEvent.click(screen.getByText(/Classic route|經典路線/));
    fireEvent.click(screen.getByRole('button', { name: /Find a schedulable itinerary|找一組班表可行日期/ }));
    expect(screen.getByRole('status')).toHaveTextContent(/cannot fit|無法把整張票接完/);
  });

  test('stays hidden for a different RTW product', () => {
    const { container } = render(<SeasonalItineraryFinder
      productId="another-product"
      templateUrl="/unused.json"
      templateOverride={template}
      onApply={() => {}}
    />);
    expect(container).toBeEmptyDOMElement();
  });

  test('lazy-loads and validates the static seasonal template before searching', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(template)));
    vi.stubGlobal('fetch', fetchMock);
    render(<SeasonalItineraryFinder
      productId={template.productId}
      templateUrl="/data/rtw-seasonal/eva-star-w26.json"
      initialStartDate="2026-11-02"
      onApply={() => {}}
    />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Classic route|經典路線/));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const find = await screen.findByRole('button', { name: /Find a schedulable itinerary|找一組班表可行日期/ });
    fireEvent.click(find);
    expect(document.querySelectorAll('[data-seasonal-flight]')).toHaveLength(8);
  });
});
