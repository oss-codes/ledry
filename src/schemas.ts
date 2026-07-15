import { z } from "zod"

export const TabSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(500),
  url: z.url().max(4096),
})

export const SourceTypeSchema = z.enum([
  "google-maps",
  "google-search",
  "website",
  "social",
])

export const RequestedSourceSchema = z.enum([
  "auto",
  "google-maps",
  "google-search",
  "website",
  "social",
])

export const EvidenceSchema = z.object({
  field: z.string().min(1).max(100),
  value: z.string().max(10_000),
  sourceUrl: z.url().max(4096),
})

export const LeadSchema = z.object({
  id: z.string().min(1).max(8192),
  name: z.string().min(1).max(500),
  organization: z.string().max(500),
  category: z.string().max(200),
  website: z.union([z.url().max(4096), z.literal("")]),
  emails: z.array(z.email().max(320)).max(20),
  phones: z.array(z.string().min(3).max(100)).max(20),
  socialProfiles: z.array(z.url().max(4096)).max(30),
  address: z.string().max(1000),
  sourceUrl: z.url().max(4096),
  sourceType: z.enum([
    "google-maps",
    "google-search",
    "website",
    "social",
    "demo",
  ]),
  capturedAt: z.iso.datetime(),
  evidence: z.array(EvidenceSchema).max(100),
  confidence: z.number().min(0).max(1),
  score: z.number().min(0).max(100),
  tags: z.array(z.string().max(100)).max(50),
})

export const QualificationStatusSchema = z.enum([
  "found",
  "qualified",
  "not-qualified",
])

export const LeadRecordSchema = z.object({
  lead: LeadSchema,
  qualificationStatus: QualificationStatusSchema,
})

export const ResearchRunSchema = z.object({
  id: z.string().min(1),
  brief: z.string().max(2_000),
  tabId: z.number().int().nonnegative(),
  requestedSource: RequestedSourceSchema,
  actualSources: z.array(SourceTypeSchema),
  limit: z.number().int().min(1).max(25),
  discovered: z.number().int().nonnegative(),
  saved: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  status: z.enum(["completed", "empty"]),
  warnings: z.array(z.string()),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  recordIds: z.array(z.string()),
})

export const ResearchResultSchema = z.object({
  run: ResearchRunSchema,
  records: z.array(LeadRecordSchema),
})

export const HealthSchema = z.object({
  status: z.literal("ok"),
  extensionConnected: z.boolean(),
  version: z.string(),
})

const DashboardSnapshotSchema = z.object({
  health: HealthSchema,
  tabs: z.array(TabSchema),
  records: z.array(LeadRecordSchema),
  runs: z.array(ResearchRunSchema),
})

export const BrowserCommandSchema = z.discriminatedUnion("action", [
  z.object({ requestId: z.uuid(), action: z.literal("tabs.list") }),
  z.object({
    requestId: z.uuid(),
    action: z.literal("tab.attach"),
    tabId: z.number().int().nonnegative(),
  }),
  z.object({
    requestId: z.uuid(),
    action: z.literal("tab.navigate"),
    tabId: z.number().int().nonnegative(),
    url: z.url().max(4096),
  }),
  z.object({
    requestId: z.uuid(),
    action: z.literal("page.snapshot"),
    tabId: z.number().int().nonnegative(),
  }),
  z.object({
    requestId: z.uuid(),
    action: z.literal("page.scroll"),
    tabId: z.number().int().nonnegative(),
    amount: z.number().int().min(100).max(3000),
  }),
  z.object({
    requestId: z.uuid(),
    action: z.literal("leads.extract"),
    tabId: z.number().int().nonnegative(),
    sourceType: RequestedSourceSchema,
  }),
])

const ExtensionResultSchema = z.discriminatedUnion("ok", [
  z.object({
    type: z.literal("result"),
    requestId: z.uuid(),
    ok: z.literal(true),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal("result"),
    requestId: z.uuid(),
    ok: z.literal(false),
    error: z.string().min(1),
  }),
])

const ExtensionCaptureSchema = z.object({
  type: z.literal("capture"),
  requestId: z.uuid(),
  tabId: z.number().int().nonnegative(),
  sourceType: RequestedSourceSchema,
  limit: z.number().int().min(1).max(25),
  brief: z.string().max(2_000),
  leads: z.array(LeadSchema).max(500),
})

export const ExtensionCaptureAckSchema = z.discriminatedUnion("ok", [
  z.object({
    type: z.literal("capture_ack"),
    requestId: z.uuid(),
    ok: z.literal(true),
    run: ResearchRunSchema,
  }),
  z.object({
    type: z.literal("capture_ack"),
    requestId: z.uuid(),
    ok: z.literal(false),
    error: z.string(),
  }),
])

export const ExtensionMessageSchema = z.union([
  z.object({
    type: z.literal("hello"),
    token: z.string().min(16),
    clientId: z.string().min(1),
    version: z.string().min(1),
  }),
  ExtensionResultSchema,
  ExtensionCaptureSchema,
])

export type BrowserCommand = z.infer<typeof BrowserCommandSchema>
export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>
export type Health = z.infer<typeof HealthSchema>
export type Lead = z.infer<typeof LeadSchema>
export type LeadRecord = z.infer<typeof LeadRecordSchema>
export type QualificationStatus = z.infer<typeof QualificationStatusSchema>
export type RequestedSource = z.infer<typeof RequestedSourceSchema>
export type ResearchRun = z.infer<typeof ResearchRunSchema>
export type ResearchResult = z.infer<typeof ResearchResultSchema>
export type SourceType = z.infer<typeof SourceTypeSchema>
export type Tab = z.infer<typeof TabSchema>
