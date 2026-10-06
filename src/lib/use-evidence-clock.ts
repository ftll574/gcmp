import { useEffect, useState } from 'react';

/** Review dates change at UTC midnight. Resume/focus also refreshes evidence
 * after background timer throttling; no recurring minute/hour polling. */
export function useEvidenceClock(deadlinesUTC: ReadonlyArray<string> = []): number {
  const [evidenceNow, setEvidenceNow] = useState(Date.now);
  const deadlinesKey = deadlinesUTC.join('|');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = (): void => {
      clearTimeout(timer);
      const now = Date.now();
      const nextMidnight = Math.floor(now / 86_400_000) * 86_400_000 + 86_400_000;
      const nextDeadline = deadlinesKey.split('|').filter(Boolean)
        .map((value) => Date.parse(value))
        .filter((value) => Number.isFinite(value) && value >= now)
        .sort((a, b) => a - b)[0];
      const nextChange = nextDeadline === undefined ? nextMidnight : Math.min(nextMidnight, nextDeadline);
      timer = setTimeout(refresh, Math.max(1, nextChange - now + 1));
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
  }, [deadlinesKey]);
  return evidenceNow;
}
