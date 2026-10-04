const CARRIER_SHARD_RE = /^route-network\/runtime-carriers\/(?:[A-Z0-9]{2,3}|[A-Z]{2}%2B[A-Z0-9]{3}%2B[a-z0-9-]+)\.json$/;

export function isCarrierShardPath(path: string): boolean {
  return CARRIER_SHARD_RE.test(path);
}
