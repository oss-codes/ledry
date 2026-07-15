import {
  array,
  boolean,
  enum as enumSchema,
  literal,
  number,
  object,
  string,
} from "zod/mini"

const QualificationStatusSchema = enumSchema([
  "found",
  "qualified",
  "not-qualified",
])

const EvidenceSchema = object({
  field: string(),
  value: string(),
  sourceUrl: string(),
})

const LeadSchema = object({
  id: string(),
  name: string(),
  organization: string(),
  category: string(),
  website: string(),
  emails: array(string()),
  phones: array(string()),
  socialProfiles: array(string()),
  address: string(),
  sourceUrl: string(),
  sourceType: enumSchema([
    "google-maps",
    "google-search",
    "website",
    "social",
    "demo",
  ]),
  capturedAt: string(),
  evidence: array(EvidenceSchema),
  confidence: number(),
  score: number(),
  tags: array(string()),
})

const ResearchRunSchema = object({
  id: string(),
  brief: string(),
  tabId: number(),
  requestedSource: enumSchema([
    "auto",
    "google-maps",
    "google-search",
    "website",
    "social",
  ]),
  actualSources: array(
    enumSchema(["google-maps", "google-search", "website", "social"]),
  ),
  limit: number(),
  discovered: number(),
  saved: number(),
  quarantined: number(),
  skipped: number(),
  status: enumSchema(["completed", "empty"]),
  warnings: array(string()),
  startedAt: string(),
  completedAt: string(),
  recordIds: array(string()),
})

export const LeadRecordSchema = object({
  lead: LeadSchema,
  qualificationStatus: QualificationStatusSchema,
})
export const LeadRecordsSchema = array(LeadRecordSchema)

export const DashboardSnapshotSchema = object({
  health: object({
    status: literal("ok"),
    extensionConnected: boolean(),
    version: string(),
  }),
  tabs: array(
    object({
      id: number(),
      selected: boolean(),
      title: string(),
      url: string(),
    }),
  ),
  records: LeadRecordsSchema,
  runs: array(ResearchRunSchema),
})

export const ResearchResultSchema = object({
  run: ResearchRunSchema,
  records: LeadRecordsSchema,
})

export const StatusFilterSchema = enumSchema([
  "all",
  "found",
  "qualified",
  "not-qualified",
])
