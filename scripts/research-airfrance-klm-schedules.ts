import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createAfklOfficialScheduleGateway } from '../server/airfrance-klm-schedules.ts';

function value(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const from = value('from')?.toUpperCase();
  const to = value('to')?.toUpperCase();
  const date = value('date');
  const host = value('host')?.toUpperCase();
  if (!from || !to || !date || (host !== 'AF' && host !== 'KL')) {
    throw new Error('Usage: --host=AF|KL --from=CDG --to=JFK --date=YYYY-MM-DD');
  }
  const gateway = createAfklOfficialScheduleGateway({ apiKey: process.env.AFKL_API_KEY });
  if (!gateway.configured) throw new Error('AFKL_API_KEY is not configured; official API research cannot run');
  const result = await gateway.queryDay({ host, from, to, date });
  const output = resolve(value('output') ?? `E:/workspace/.gcmp-route-work/official-carrier-engines/afkl/${host}-${from}-${to}-${date}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ output, segments: result.segments.length, complete: result.complete, droppedRows: result.droppedRows }, null, 2));
}

await main();
