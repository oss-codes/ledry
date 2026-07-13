import type { Lead, LeadRecord } from "./schemas"

function csvCell(value: string): string {
  const safeValue = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safeValue.replaceAll('"', '""')}"`
}

export function serializeLeads(
  leads: readonly Lead[],
  format: "csv" | "json" | "jsonl",
): string {
  switch (format) {
    case "json":
      return `${JSON.stringify(leads, null, 2)}\n`
    case "jsonl":
      return `${leads.map((lead) => JSON.stringify(lead)).join("\n")}\n`
    case "csv": {
      const header = [
        "name",
        "organization",
        "category",
        "website",
        "emails",
        "phones",
        "socialProfiles",
        "address",
        "sourceUrl",
        "sourceType",
        "capturedAt",
        "confidence",
        "evidence",
        "score",
      ]
      const rows = leads.map((lead) =>
        [
          lead.name,
          lead.organization,
          lead.category,
          lead.website,
          lead.emails.join(";"),
          lead.phones.join(";"),
          lead.socialProfiles.join(";"),
          lead.address,
          lead.sourceUrl,
          lead.sourceType,
          lead.capturedAt,
          String(lead.confidence),
          JSON.stringify(lead.evidence),
          String(lead.score),
        ]
          .map(csvCell)
          .join(","),
      )
      return `${header.join(",")}\n${rows.join("\n")}\n`
    }
    default:
      return format satisfies never
  }
}

export function serializeLeadRecords(
  records: readonly LeadRecord[],
  format: "csv" | "json" | "jsonl",
): string {
  if (format === "json") return `${JSON.stringify(records, null, 2)}\n`
  if (format === "jsonl")
    return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`
  const header = [
    "qualificationStatus",
    "name",
    "organization",
    "category",
    "website",
    "emails",
    "phones",
    "socialProfiles",
    "address",
    "sourceUrl",
    "sourceType",
    "capturedAt",
    "confidence",
    "score",
    "evidence",
  ]
  const rows = records.map(({ lead, qualificationStatus }) =>
    [
      qualificationStatus,
      lead.name,
      lead.organization,
      lead.category,
      lead.website,
      lead.emails.join(";"),
      lead.phones.join(";"),
      lead.socialProfiles.join(";"),
      lead.address,
      lead.sourceUrl,
      lead.sourceType,
      lead.capturedAt,
      String(lead.confidence),
      String(lead.score),
      JSON.stringify(lead.evidence),
    ]
      .map(csvCell)
      .join(","),
  )
  return `${header.join(",")}\n${rows.join("\n")}\n`
}
