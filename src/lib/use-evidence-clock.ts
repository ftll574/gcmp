import { useEffect, useState } from 'react';

/** Review dates change at UTC midnight. Resume/focus also refreshes evidence
 * after background timer throttling; no recurring minute/hour polling. */
export function useEvidenceClock(): number {
  const [evidenceNow, setEvidenceNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = (): void => {
      clearTimeout(timer);
      const now = Date.now();
      const nextMidnight = Math.floor(now / 86_400_000) * 86_400_000 + 86_400_000;
      timer = setTimeout(refresh, nextMidnight - now + 1);
    };
    const refresh = (): void => { setEvidenceNow(Date.now()); arm(); };
    const visible = (): void => { if (document.visibilityState === 'visible') refresh(); };
    arm();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return evidenceNow;
}
