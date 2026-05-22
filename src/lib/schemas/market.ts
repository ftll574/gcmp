import { z } from 'zod';
import { RtwAllianceSchema } from './rtw-rule.ts';

export const MarketPriorityRoleSchema = z.enum([
  'home-airline',
  'nearby-hub',
  'rtw-award',
  'alliance-rtw-fare',
  'partner-award',
  'watchlist',
]);
export type MarketPriorityRole = z.infer<typeof MarketPriorityRoleSchema>;

export const MarketRtwRelevanceSchema = z.enum([
  'primary',
  'secondary',
  'limited',
  'negative',
  'watch',
]);
export type MarketRtwRelevance = z.infer<typeof MarketRtwRelevanceSchema>;

export const MarketAirlineSchema = z.object({
  airline: z.string().regex(/^[A-Z0-9]{2,3}$/),
  airlineName: z.string().min(1),
  alliance: RtwAllianceSchema.optional(),
  roles: z.array(MarketPriorityRoleSchema).min(1),
  rtwRelevance: MarketRtwRelevanceSchema,
  notes: z.array(z.string()).optional(),
  sourceUrls: z.array(z.string().url()).min(1),
});
export type MarketAirline = z.infer<typeof MarketAirlineSchema>;

export const MarketProgramSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  label: z.string().min(1),
  airline: z.string().regex(/^[A-Z0-9]{2,3}$/).optional(),
  alliance: RtwAllianceSchema.optional(),
  roles: z.array(MarketPriorityRoleSchema).min(1),
  rtwRelevance: MarketRtwRelevanceSchema,
  notes: z.array(z.string()).optional(),
  sourceUrls: z.array(z.string().url()).min(1),
});
export type MarketProgram = z.infer<typeof MarketProgramSchema>;

export const MarketProfileSchema = z.object({
  market: z.string().regex(/^[A-Z]{2}$/),
  label: z.string().min(1),
  defaultLocale: z.string().min(2),
  version: z.string().regex(/^\d{4}\.[1-4]$/),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  primaryAirports: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1),
  priorityAirlines: z.array(MarketAirlineSchema).min(1),
  priorityPrograms: z.array(MarketProgramSchema).min(1),
});
export type MarketProfile = z.infer<typeof MarketProfileSchema>;
