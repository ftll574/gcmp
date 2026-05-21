/**
 * Routing state hook. Syncs RoutingRequest to/from URL hash on every change.
 *
 * Hash-based routing was chosen over pathname routing for v1 because it
 * works on any static host (GitHub Pages, Cloudflare Pages, Netlify, S3)
 * without an SPA fallback or 404.html trick. The hash is the canonical
 * share artifact:
 *
 *   gcmp.app/#/r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J&rv=2026.4
 *
 *   parseShareUrl(window.location.hash)  → initial state
 *   setRouting(newRouting)               → updates state + window.location.hash
 *   hashchange                            → updates state on browser back/forward
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeShareUrl, parseShareUrl } from '../lib/url-schema.ts';
import type { RoutingRequest } from '../lib/types.ts';

export interface RoutingState {
  request: RoutingRequest;
  error: string | null;
}

const DEFAULT_REQUEST: RoutingRequest = {
  legs: [],
  cabin: 'business',
  programs: ['aa-aadvantage', 'as-mileage-plan'],
};

function getInitialFromHash(): RoutingState {
  if (typeof window === 'undefined') {
    return { request: DEFAULT_REQUEST, error: null };
  }
  const hash = window.location.hash;
  if (!hash || hash.length < 2) {
    return { request: DEFAULT_REQUEST, error: null };
  }
  // hash is "#/r/v1/..." — strip the leading "#".
  const parsed = parseShareUrl(hash.slice(1));
  if (parsed.ok) {
    return { request: parsed.request, error: null };
  }
  return { request: DEFAULT_REQUEST, error: parsed.message };
}

export function useRoutingState(): {
  state: RoutingState;
  setRouting: (next: RoutingRequest) => void;
  shareUrl: string | null;
} {
  const [state, setState] = useState<RoutingState>(() => getInitialFromHash());
  const ignoreNextHashChange = useRef(false);

  useEffect(() => {
    function onHashChange(): void {
      if (ignoreNextHashChange.current) {
        ignoreNextHashChange.current = false;
        return;
      }
      setState(getInitialFromHash());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setRouting = useCallback((next: RoutingRequest) => {
    setState({ request: next, error: null });
    if (next.legs.length === 0) {
      if (window.location.hash !== '') {
        ignoreNextHashChange.current = true;
        // Use replaceState so the empty-state doesn't push a new history entry on every keystroke.
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }
      return;
    }
    const url = encodeShareUrl(next);
    const target = '#' + url;
    if (window.location.hash !== target) {
      ignoreNextHashChange.current = true;
      window.location.hash = url;
    }
  }, []);

  const shareUrl = state.request.legs.length > 0
    ? '#' + encodeShareUrl(state.request)
    : null;

  return { state, setRouting, shareUrl };
}
