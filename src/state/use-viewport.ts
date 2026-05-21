/**
 * Tracks viewport width. Used to switch into mobile read-only mode below
 * 768px (per design review Pass 6).
 */

import { useEffect, useState } from 'react';

export function useViewportWidth(): number {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );

  useEffect(() => {
    function onResize(): void {
      setWidth(window.innerWidth);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}
