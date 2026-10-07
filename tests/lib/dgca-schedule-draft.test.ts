import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  DgcaScheduleEvidenceCatalogSchema,
  dgcaDraftDateStatus,
  matchesDgcaIdentityWindow,
} from '../../src/lib/schemas/dgca-schedule-evidence.ts';

const catalog = DgcaScheduleEvidenceCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/dgca-schedule-evidence-20261007.json', 'utf8')),
);
function findReference(sourceId: string, referenceId: string) {
  const source = catalog.sources.find(item => item.id === sourceId);
  const reference = source?.references.find(item => item.id === referenceId);
  if (!source || !reference) throw new Error(`Missing DGCA fixture ${sourceId}/${referenceId}`);
  return { source, reference };
}

test('uses only separately corroborated weekdays, never decodes raw frequency digits', () => {
  const { reference } = findReference('dgca-indigo-domestic-ss-2026', 'dgca-indigo-6e102-bom-del');
  expect(dgcaDraftDateStatus(reference, '2026-10-07')).toBe('weekday-supported');
  expect(dgcaDraftDateStatus(reference, '2026-10-25')).toBe('outside-window');

  const unknownWeekdayReference = {
    ...reference,
    variants: reference.variants.map(variant => ({ ...variant, frequencyWeekdaysCorroborated: [] })),
  };
  expect(unknownWeekdayReference.variants[0]?.frequencyRaw).toBe('1234567');
  expect(dgcaDraftDateStatus(unknownWeekdayReference, '2026-10-07')).toBe('weekday-unknown');
});

test('excludes a corroborated weekday mismatch and retains frequency-conflict uncertainty', () => {
  const { reference: corroboratedWeekdays } = findReference('dgca-indigo-domestic-ss-2026', 'dgca-indigo-6e125-ixj-nmi');
  expect(dgcaDraftDateStatus(corroboratedWeekdays, '2026-04-02')).toBe('weekday-supported');
  expect(dgcaDraftDateStatus(corroboratedWeekdays, '2026-04-03')).toBe('weekday-not-supported');

  const { reference: conflicting } = findReference('dgca-spicejet-ss-2026', 'dgca-spicejet-ss26-sg105-del-pnq');
  expect(conflicting.variants.some(variant => variant.conflictFields.includes('frequency'))).toBe(true);
  expect(dgcaDraftDateStatus(conflicting, '2026-10-07')).toBe('weekday-conflict');
});

test('future and expired identity windows are date-bounded and inclusive', () => {
  const { reference: futureOnly } = findReference('dgca-indigo-domestic-ss-2026', 'dgca-indigo-6e114-ccu-jai');
  expect(matchesDgcaIdentityWindow(futureOnly, '2026-10-23')).toBe(false);
  expect(matchesDgcaIdentityWindow(futureOnly, '2026-10-24')).toBe(true);
  expect(matchesDgcaIdentityWindow(futureOnly, '2026-10-25')).toBe(false);
  expect(dgcaDraftDateStatus(futureOnly, '2026-10-24')).toBe('weekday-supported');
});
