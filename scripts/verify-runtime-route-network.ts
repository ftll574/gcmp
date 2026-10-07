import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const ROOT = 'public/data/route-network';
function sha256(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizedBytes(text: string): number {
  return Buffer.byteLength(text.replace(/\r\n/g, '\n'));
}

const meta = JSON.parse(readFileSync(`${ROOT}/runtime-current.meta.json`, 'utf8')) as {
  inputs: Record<string, string>;
  outputSha256: string;
  routes: number;
  originShards: Record<string, { routes: number; bytes: number; sha256: string }>;
};

for (const [file, expected] of Object.entries(meta.inputs)) {
  const path = /^(?:scripts|docs|public)\//.test(file) ? file : `${ROOT}/${file}`;
  const actual = file.endsWith('.xml') ? sha256Bytes(readFileSync(path)) : sha256(readFileSync(path, 'utf8'));
  if (expected !== actual) throw new Error(`Stale runtime input hash: ${file}`);
}
const runtimeText = readFileSync(`${ROOT}/runtime-current.json`, 'utf8');
if (meta.outputSha256 !== sha256(runtimeText)) throw new Error('runtime-current.json hash mismatch');

let shardedRoutes = 0;
for (const [letter, shardMeta] of Object.entries(meta.originShards)) {
  const text = readFileSync(`${ROOT}/runtime-origins/${letter}.json`, 'utf8');
  if (normalizedBytes(text) !== shardMeta.bytes) throw new Error(`Shard size mismatch: ${letter}`);
  if (sha256(text) !== shardMeta.sha256) throw new Error(`Shard hash mismatch: ${letter}`);
  const shard = parseRouteNetworkCatalog(JSON.parse(text));
  if (shard.routes.length !== shardMeta.routes) throw new Error(`Shard route count mismatch: ${letter}`);
  if (!shard.routes.every((route) => route.pair[0].startsWith(letter))) {
    throw new Error(`Shard origin mismatch: ${letter}`);
  }
  shardedRoutes += shard.routes.length;
}
if (shardedRoutes !== meta.routes) throw new Error(`Shard total ${shardedRoutes} != runtime total ${meta.routes}`);

console.log(JSON.stringify({ verified: true, inputs: Object.keys(meta.inputs).length, shards: Object.keys(meta.originShards).length, routes: meta.routes }, null, 2));
