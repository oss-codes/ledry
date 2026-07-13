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
  tabs: array(object({ id: number(), title: string(), url: string() })),
  records: LeadRecordsSchema,
})

export const StatusFilterSchema = enumSchema([
  "all",
  "found",
  "qualified",
  "not-qualified",
])
