import { expect, test } from 'vitest';
import { defaultScheduleServiceBase } from '../../src/lib/schedule-service-base.ts';

test('static GitHub Pages deployment does not target its nonexistent schedule API', () => {
  expect(defaultScheduleServiceBase(undefined, 'ftll574.github.io')).toBeNull();
  expect(defaultScheduleServiceBase('', 'ftll574.github.io')).toBeNull();
  expect(defaultScheduleServiceBase(undefined, 'github.io')).toBeNull();
});

test('explicit service configuration and non-static local defaults remain available', () => {
  expect(defaultScheduleServiceBase('https://api.example.test', 'ftll574.github.io')).toBe('https://api.example.test');
  expect(defaultScheduleServiceBase(undefined, 'localhost')).toBe('/api');
});
