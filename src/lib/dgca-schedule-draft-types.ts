/** Lightweight itinerary-facing DGCA snapshot types. Kept separate from the
 * Zod schema inference so every FlightLeg does not drag the full source
 * catalog's validation types through the planner's common type graph. */
export interface DgcaDraftSourceSnapshot {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly pdfSha256: string;
  readonly pdfBytes: number;
  readonly pages: number;
  readonly publishedDateRaw: string;
  readonly checkedAt: string | null;
  readonly reviewBy: string | null;
  readonly reviewedSnapshotDate: string;
  readonly attribution: string;
  readonly reusePolicyUrl: string;
  readonly reusePolicyStatement: string;
  readonly operator: {
    readonly printedNameRaw: string | null;
    readonly operatorCodeRaw: string | null;
    readonly carrierIdentityStatus: 'independently-mapped' | 'unresolved';
    readonly carrierName: string | null;
    readonly iataDesignator: string | null;
    readonly icaoCode: string | null;
    readonly identitySourceUrl: string | null;
    readonly qualification: string;
  };
}

export interface DgcaDraftSourceRow {
  readonly referenceRaw: string;
  readonly page: number;
  readonly physicalRow: number | null;
  readonly stationSectionOrdinal: number | null;
  readonly stationSectionRaw: string | null;
  readonly printedRowRaw: string | null;
  readonly sourceSide: 'arrival' | 'departure' | null;
  readonly sourceRowSha256: string | null;
  readonly sourceRowTextSha256?: string | null | undefined;
}

export interface DgcaDraftVariantSnapshot {
  readonly id: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string;
  readonly effectiveFromRaw: string;
  readonly effectiveUntilRaw: string;
  readonly sourceStatusAsOf?: 'current' | 'future' | 'expired' | undefined;
  readonly frequencyRaw: string;
  readonly frequencyQualification: string;
  readonly frequencyWeekdaysCorroborated: ReadonlyArray<string>;
  readonly departureClockValuesRaw: ReadonlyArray<string>;
  readonly arrivalClockValuesRaw: ReadonlyArray<string>;
  readonly aircraftTypeValuesRaw: ReadonlyArray<string>;
  readonly timeBasis: 'unknown';
  readonly timezone: null;
  readonly sourceRows: ReadonlyArray<DgcaDraftSourceRow>;
  readonly stationCodeResolution: string;
  readonly stationLabelsRaw: ReadonlyArray<string>;
  readonly sourceMovementSides: ReadonlyArray<'arrival' | 'departure'>;
  readonly sourceCounterpartStatus: 'one-sided' | 'paired' | 'unknown';
  readonly conflictIds: ReadonlyArray<string>;
  readonly conflictKinds: ReadonlyArray<string>;
  readonly conflictFields: ReadonlyArray<'frequency' | 'departureClock' | 'arrivalClock' | 'aircraftType' | 'rawClock'>;
  readonly conflictEvidence: ReadonlyArray<{
    readonly id: string;
    readonly peerVariantId: string;
    readonly overlapFrom: string;
    readonly overlapUntil: string;
    readonly differingRawFields: ReadonlyArray<'frequency' | 'departureClock' | 'arrivalClock' | 'aircraftType' | 'rawClock'>;
    readonly interpretation: string;
  }>;
  readonly hasVariantConflict: boolean;
  readonly timeConflict: boolean;
  readonly notes: ReadonlyArray<string>;
}

export interface DgcaDraftIdentityReference {
  readonly id: string;
  readonly publishedDesignatorRaw: string;
  readonly designatorKey: string;
  readonly designatorPrefixRaw: string;
  readonly flightDigitsRaw: string;
  readonly originIata: string;
  readonly destinationIata: string;
  readonly identityStatus: 'accepted-identity-only';
  readonly airportCatalogStatus: 'all-endpoints-present' | 'source-code-not-in-current-catalog';
  readonly otherDirectionalRoutes: ReadonlyArray<string>;
  readonly sourceCounterpartStatus: 'one-sided' | 'paired' | 'unknown';
  readonly hasVariantConflict: boolean;
  readonly conflictReferences: ReadonlyArray<string>;
  readonly variants: ReadonlyArray<DgcaDraftVariantSnapshot>;
}

export interface DgcaScheduleDraftReference {
  readonly source: DgcaDraftSourceSnapshot;
  readonly reference: DgcaDraftIdentityReference;
  readonly catalogSnapshotAsOfDate: string;
}
