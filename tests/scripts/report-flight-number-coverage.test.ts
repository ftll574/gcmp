import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseFlightNumberCoverageArgs } from '../../src/lib/rtw/flight-number-coverage-cli.ts';

function runCli(...args: string[]) {
  return spawnSync(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), resolve('scripts/report-flight-number-coverage.ts'), ...args],
    { cwd: resolve('.'), encoding: 'utf8' },
  );
}

describe('flight-number coverage CLI', () => {
  test('parses an explicit valid date and deterministic default UTC date', () => {
    expect(parseFlightNumberCoverageArgs(['2026-09-12', '--summary'], '2000-01-01'))
      .toEqual({ asOf: '2026-09-12', summaryOnly: true });
    expect(parseFlightNumberCoverageArgs([], '2026-09-13'))
      .toEqual({ asOf: '2026-09-13', summaryOnly: false });

    const child = runCli('2026-09-12', '--summary');
    expect(child.status).toBe(0);
    const report = JSON.parse(child.stdout);
    expect(report).toMatchObject({
      asOf: '2026-09-12',
      denominator: 'bounded-alliance-flight-number-targets',
      globalCoverage: 'unknown',
    });
    expect(report.total.unknown).toBeGreaterThan(0);
    expect(report.highValue.unknown).toBeGreaterThan(0);
  }, 20_000);

  test('rejects malformed and impossible dates with a non-zero exit', () => {
    expect(runCli('not-a-date').status).not.toBe(0);
    const impossible = runCli('2026-02-30');
    expect(impossible.status).not.toBe(0);
    expect(impossible.stderr).toContain('Invalid asOf date: 2026-02-30');
  });

  test('rejects unknown flags and extra positional arguments instead of ignoring them', () => {
    const unknown = runCli('2026-09-12', '--wat');
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain('Unknown flag: --wat');

    expect(() => parseFlightNumberCoverageArgs(['2026-09-12', '2026-09-13']))
      .toThrow('Unexpected argument: 2026-09-13');
  });
});
