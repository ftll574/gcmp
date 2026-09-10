import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AirportAutocomplete } from '../../src/components/AirportAutocomplete.tsx';
import { setLocale } from '../../src/i18n/i18n.ts';
import { buildAirportIndex } from '../../src/lib/airport-index.ts';
import type { Airport } from '../../src/lib/types.ts';

const TPE: Airport = {
  iata: 'TPE',
  name: 'Taiwan Taoyuan International Airport',
  city: 'Taoyuan',
  country: 'TW',
  lat: 25.0777,
  lon: 121.2328,
};
const TSA: Airport = {
  iata: 'TSA',
  name: 'Taipei Songshan Airport',
  city: 'Taipei',
  country: 'TW',
  lat: 25.0694,
  lon: 121.5525,
};

beforeEach(() => setLocale('en'));
afterEach(cleanup);

test('wires the airport search as an accessible combobox with an active listbox option', async () => {
  render(<AirportAutocomplete index={buildAirportIndex([TPE, TSA])} onCommit={vi.fn()} />);

  const input = screen.getByRole('combobox', { name: 'Add airport (IATA code, e.g. SFO)' });
  expect(input).toHaveAttribute('name', 'airport-search');
  expect(input).toHaveAttribute('autocomplete', 'off');
  expect(input).toHaveAttribute('aria-expanded', 'false');

  fireEvent.change(input, { target: { value: 'T' } });
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

  const listbox = screen.getByRole('listbox');
  const options = screen.getAllByRole('option');
  expect(listbox.id).not.toBe('');
  expect(options[0]?.id).not.toBe('');
  expect(input).toHaveAttribute('aria-controls', listbox.id);
  expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id);
  expect(options[0]).toHaveAttribute('aria-selected', 'true');

  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input).toHaveAttribute('aria-activedescendant', options[1]?.id);
  expect(options[1]).toHaveAttribute('aria-selected', 'true');

  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(input).not.toHaveAttribute('aria-controls');
  expect(input).not.toHaveAttribute('aria-activedescendant');
});
