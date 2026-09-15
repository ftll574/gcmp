/**
 * One-off local fixture generator for B6: writes a tiny MrAirspace-shaped
 * parquet (6 rows, 2026 Q2) so `scripts/ingest-mrairspace.ts --parquet`
 * can be exercised end-to-end WITHOUT the 870MB real release download.
 *
 *   npx tsx scripts/make-mrairspace-fixture.ts
 *   npx tsx scripts/ingest-mrairspace.ts --quarter 2026-Q2 --parquet .tmp/mrairspace-fixture.parquet
 *
 * This file is a dev tool, not part of the shipping data pipeline.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

async function main(): Promise<void> {
  // parquetjs is a CommonJS package; dynamic import() of CJS from ESM/tsx
  // does not reliably expose its named exports, so load it via createRequire
  // (the same pattern the ingest script's parquetjs fallback relies on).
  const parquet = require('parquetjs') as {
    ParquetSchema: new (fields: Record<string, unknown>) => unknown;
    ParquetWriter: {
      openFile: (schema: unknown, path: string) => Promise<{
        appendRow: (row: Record<string, unknown>) => Promise<void>;
        close: () => Promise<void>;
      }>;
    };
  };
  const schema = new parquet.ParquetSchema({
    ICAO_Hex: { type: 'UTF8' },
    Reg: { type: 'UTF8' },
    AC_Type: { type: 'UTF8' },
    Airline: { type: 'UTF8' },
    Callsign: { type: 'UTF8' },
    Track_Origin_DateTime_UTC: { type: 'UTF8' },
    Track_Destination_DateTime_UTC: { type: 'UTF8' },
    Track_Origin_ApplicableAirports: { type: 'UTF8' },
    Track_Destination_ApplicableAirports: { type: 'UTF8' },
    Route_Validation_Based_on_Callsign: { type: 'UTF8' },
  });
  const outDir = resolve(process.cwd(), '.tmp');
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, 'mrairspace-fixture.parquet');

  const writer = await parquet.ParquetWriter.openFile(schema, outFile);
  const rows = [
    // BR (EVA) TPE→HND, two observations
    { ICAO_Hex: '89908F', Reg: 'B-17811', AC_Type: 'A321', Airline: 'EVA', Callsign: 'EVA008', Track_Origin_DateTime_UTC: '2026-04-01 00:00:00', Track_Destination_DateTime_UTC: '2026-04-01 02:10:00', Track_Origin_ApplicableAirports: 'RCTP', Track_Destination_ApplicableAirports: 'RJTT', Route_Validation_Based_on_Callsign: '1' },
    { ICAO_Hex: '89908F', Reg: 'B-17811', AC_Type: 'A321', Airline: 'EVA', Callsign: 'EVA008', Track_Origin_DateTime_UTC: '2026-04-03 00:00:00', Track_Destination_DateTime_UTC: '2026-04-03 02:10:00', Track_Origin_ApplicableAirports: 'RCTP', Track_Destination_ApplicableAirports: 'RJTT', Route_Validation_Based_on_Callsign: '1' },
    // BR (EVA) TPE→SFO, two observations
    { ICAO_Hex: '899086', Reg: 'B-17801', AC_Type: 'A321', Airline: 'EVA', Callsign: 'EVA018', Track_Origin_DateTime_UTC: '2026-04-02 00:00:00', Track_Destination_DateTime_UTC: '2026-04-02 11:00:00', Track_Origin_ApplicableAirports: 'RCTP', Track_Destination_ApplicableAirports: 'KSFO', Route_Validation_Based_on_Callsign: '1' },
    { ICAO_Hex: '899086', Reg: 'B-17801', AC_Type: 'A321', Airline: 'EVA', Callsign: 'EVA018', Track_Origin_DateTime_UTC: '2026-04-04 00:00:00', Track_Destination_DateTime_UTC: '2026-04-04 11:00:00', Track_Origin_ApplicableAirports: 'RCTP', Track_Destination_ApplicableAirports: 'KSFO', Route_Validation_Based_on_Callsign: '1' },
    // JX (SJX) TPE→HND, two observations
    { ICAO_Hex: '899089', Reg: 'B-58201', AC_Type: 'A321', Airline: 'SJX', Callsign: 'SJX012', Track_Origin_DateTime_UTC: '2026-05-01 00:00:00', Track_Destination_DateTime_UTC: '2026-05-01 02:05:00', Track_Origin_ApplicableAirports: 'RCTP', Track_Destination_ApplicableAirports: 'RJTT', Route_Validation_Based_on_Callsign: '1' },
    { ICAO_Hex: '899089', Reg: 'B-58201', AC_Type: 'A321', Airline: 'SJX', Callsign: 'SJX012', Track_Origin_DateTime_UTC: '2026-05-02 00:00:00', Track_Destination_DateTime_UTC: '2026-05-02 02:05:00', Track_Origin_ApplicableAirports: 'RCTP', Track_Destination_ApplicableAirports: 'RJTT', Route_Validation_Based_on_Callsign: '1' },
  ];
  for (const row of rows) await writer.appendRow(row);
  await writer.close();
  console.log(`Wrote ${rows.length} rows → ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
