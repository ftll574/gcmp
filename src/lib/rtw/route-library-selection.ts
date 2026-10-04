import type { RouteLibraryEntitySelection } from './route-library-entities.ts';

export function parseRouteLibrarySelection(search: string): RouteLibraryEntitySelection | null {
  const params = new URLSearchParams(search);
  const kind = params.get('entity');
  const encodedId = params.get('id') ?? '';
  const rawId = encodedId.includes('+') ? encodedId : encodedId.toUpperCase();
  if (kind === 'airport' && /^[A-Z]{3}$/.test(rawId)) return { kind, id: rawId };
  if (kind === 'airline' && (/^[A-Z0-9]{2,3}$/.test(rawId) || /^[A-Z]{2}\+[A-Z0-9]{3}\+[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawId))) return { kind, id: rawId };
  if (kind === 'route' && /^[A-Z]{3}-[A-Z]{3}$/.test(rawId)) return { kind, id: rawId };
  return null;
}
