import { afterEach, expect, test } from 'vitest';
import { parseRouteLibrarySelection } from '../../src/lib/rtw/route-library-selection.ts';

afterEach(() => window.history.replaceState({}, '', '/'));

test('qualified airline entity IDs round-trip in URL while legacy IATA IDs stay uppercase', () => {
  const entityKey = 'BR+ACN+azul-conecta-ltda';
  expect(parseRouteLibrarySelection(`?view=routes&entity=airline&id=${encodeURIComponent(entityKey)}`)).toEqual({ kind: 'airline', id: entityKey });
  expect(parseRouteLibrarySelection('?view=routes&entity=airline&id=ua')).toEqual({ kind: 'airline', id: 'UA' });
});
