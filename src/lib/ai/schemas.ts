import { z } from "zod";

const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Data non valida.");

export const extractedCareItemSchema = z.object({
  kind: z.enum(["event", "task"]),
  title: z.string().trim().min(1).max(140),
  category: z.enum(["WORK", "SCHOOL", "SPORT", "HEALTH", "HOUSEHOLD", "LEISURE", "CARE", "ERRANDS", "ADMIN", "COMMUNITY"]),
  start: isoDateTime.nullable(),
  end: isoDateTime.nullable(),
  estimated_minutes: z.number().int().min(0).max(1440).nullable(),
  preparation_minutes: z.number().int().min(0).max(240).nullable(),
  travel_minutes: z.number().int().min(0).max(240).nullable(),
  participants: z.array(z.string().max(80)).max(8),
  assignee: z.string().max(80).nullable(),
  requires_booking: z.boolean(),
  location: z.string().max(160).nullable(),
  notes: z.string().max(600).nullable(),
  missing_information: z.array(z.string().max(160)).max(6),
  confidence: z.number().min(0).max(1),
}).strict();

export const extractionSchema = z.object({
  intent: z.literal("extract_care_items"),
  confidence: z.number().min(0).max(1),
  needs_confirmation: z.literal(true),
  items: z.array(extractedCareItemSchema).max(12),
  people_mentioned: z.array(z.string().max(80)).max(10),
  explanation: z.string().max(800),
}).strict();

export const weeklySummarySchema = z.object({
  intent: z.literal("weekly_summary"),
  headline: z.string().max(200),
  highlights: z.array(z.string().max(240)).min(1).max(6),
  imbalances: z.array(z.string().max(240)).max(5),
  invisible_work: z.array(z.string().max(240)).max(5),
  suggestions: z.array(z.string().max(240)).max(5),
  confidence: z.number().min(0).max(1),
}).strict();

export const negotiationSchema = z.object({
  intent: z.literal("negotiate"),
  framing: z.string().max(400),
  options: z.array(z.object({
    label: z.string().max(160),
    kind: z.enum(["assign", "rotate", "support", "move", "split", "reduce", "confirm"]),
    rationale: z.string().max(300),
    tradeoff: z.string().max(300),
  }).strict()).min(1).max(4),
  confidence: z.number().min(0).max(1),
}).strict();

export type Extraction = z.infer<typeof extractionSchema>;
export type ExtractedCareItem = z.infer<typeof extractedCareItemSchema>;
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
export type Negotiation = z.infer<typeof negotiationSchema>;
