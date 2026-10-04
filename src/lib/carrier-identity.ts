/**
 * Runtime carrier codes are IATA designators. Some legal operators share one
 * controlled/ambiguous designator, so route identity can carry a separate,
 * stable entity discriminator. Legacy rows deliberately keep their old keys.
 */
export interface CarrierIdentityLike {
  readonly carrier: string;
  readonly carrierEntityKey?: string | undefined;
}

export function carrierIdentityKey(value: CarrierIdentityLike): string {
  return value.carrierEntityKey ?? value.carrier;
}

export function carrierRouteKey(value: CarrierIdentityLike, from: string, to: string): string {
  return `${carrierIdentityKey(value)}:${from}-${to}`;
}

export function carrierEntityLabel(value: CarrierIdentityLike & { readonly carrierEntityName?: string | undefined }): string {
  return value.carrierEntityName ? `${value.carrier} · ${value.carrierEntityName}` : value.carrier;
}

export function carrierShardName(value: CarrierIdentityLike): string {
  return carrierShardNameFromKey(carrierIdentityKey(value));
}

/** Shard paths encode `+` so their filesystem and URL spelling is identical. */
export function carrierShardNameFromKey(identityKey: string): string {
  return identityKey.includes('+') ? encodeURIComponent(identityKey) : identityKey;
}

export function isQualifiedCarrierEntity(value: CarrierIdentityLike): boolean {
  return value.carrierEntityKey !== undefined;
}

export interface RegisteredPlanOperatorIdentity {
  readonly registeredOperator: string;
  readonly rawOperatorICAO: string;
  readonly registeredOperatorName: string;
  readonly country: string;
}

export function carrierEntitySlug(legalName: string): string {
  return legalName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function qualifiedCarrierEntityKey(country: string, icao: string, legalName: string): string {
  return `${country.toUpperCase()}+${icao.toUpperCase()}+${carrierEntitySlug(legalName)}`;
}

/** Return entity proof only when raw source operator identity matches the route. */
export function registeredPlanEntityFields(
  route: CarrierIdentityLike,
  operator: RegisteredPlanOperatorIdentity,
): { readonly registeredOperatorICAO?: string; readonly carrierEntityKey?: string } | null {
  if (operator.registeredOperator !== route.carrier) return null;
  if (!route.carrierEntityKey) return {};
  if (qualifiedCarrierEntityKey(operator.country, operator.rawOperatorICAO, operator.registeredOperatorName) !== route.carrierEntityKey) return null;
  return { registeredOperatorICAO: operator.rawOperatorICAO, carrierEntityKey: route.carrierEntityKey };
}
