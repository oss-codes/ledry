import type {
  DashboardSnapshot,
  LeadRecord,
  QualificationStatus,
  SourceType,
} from "../src/schemas"
import {
  DashboardSnapshotSchema,
  LeadRecordSchema,
  LeadRecordsSchema,
} from "./schemas"

type Parser<T> = { readonly parse: (value: unknown) => T }

async function request<T>(
  path: string,
  schema: Parser<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Request failed (${response.status}): ${message}`)
  }
  return schema.parse(await response.json())
}

export function fetchDashboard(): Promise<DashboardSnapshot> {
  return request("/api/dashboard", DashboardSnapshotSchema)
}

export function extractTab(
  tabId: number,
  sourceType: SourceType,
): Promise<readonly LeadRecord[]> {
  return request("/api/extract", LeadRecordsSchema, {
    method: "POST",
    body: JSON.stringify({ tabId, sourceType }),
  })
}

export function updateQualification(
  id: string,
  qualificationStatus: QualificationStatus,
): Promise<LeadRecord> {
  return request(
    `/api/records/${encodeURIComponent(id)}/qualification`,
    LeadRecordSchema,
    {
      method: "PATCH",
      body: JSON.stringify({ qualificationStatus }),
    },
  )
}
