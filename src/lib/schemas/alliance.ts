import { z } from 'zod';
import { RtwAllianceSchema } from './rtw-rule.ts';

export const AllianceMembershipStatusSchema = z.enum([
  'member',
  'affiliate',
  'connect',
  'suspended',
  'former',
]);
export type AllianceMembershipStatus = z.infer<typeof AllianceMembershipStatusSchema>;

export const AirlineAllianceMembershipSchema = z.object({
  airline: z.string().regex(/^[A-Z0-9]{2,3}$/),
  airlineName: z.string().min(1),
  alliance: RtwAllianceSchema,
  status: AllianceMembershipStatusSchema,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourceUrl: z.string().url(),
  notes: z.array(z.string()).optional(),
});
export type AirlineAllianceMembership = z.infer<typeof AirlineAllianceMembershipSchema>;

export const AllianceCatalogSchema = z.object({
  version: z.string().regex(/^\d{4}\.[1-4]$/),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceUrls: z.array(z.string().url()).min(1),
  memberships: z.array(AirlineAllianceMembershipSchema).min(1),
});
export type AllianceCatalog = z.infer<typeof AllianceCatalogSchema>;
