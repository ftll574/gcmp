import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSiroRawRowsArchive, SIROS_PROPOSAL_PATH, SIROS_RAW_ROWS_PATH } from './lib/siros-registered-plan-input.ts';

const sourceCsvPath = process.argv[2];
if (!sourceCsvPath) throw new Error('Usage: npx tsx scripts/build-siros-source-row-ledger.ts <captured-si-ro-s-csv-path>');

const proposalPath = resolve('public/data', SIROS_PROPOSAL_PATH);
const outputPath = resolve('public/data', SIROS_RAW_ROWS_PATH);
const archive = buildSiroRawRowsArchive(readFileSync(sourceCsvPath), readFileSync(proposalPath));
writeFileSync(outputPath, archive);
console.log(JSON.stringify({ outputPath, bytes: archive.byteLength }, null, 2));
