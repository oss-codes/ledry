import { Database } from "bun:sqlite"
import { chmodSync, existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { z } from "zod"
import { prepareResearchResults } from "./research"
import {
  type Lead,
  type LeadRecord,
  LeadRecordSchema,
  LeadSchema,
  type QualificationStatus,
  type RequestedSource,
  type ResearchRun,
  ResearchRunSchema,
} from "./schemas"

const StoredLeadRowSchema = z.object({
  data: z.string(),
  qualification_status: z.string(),
})
const ColumnSchema = z.object({ name: z.string() })
const StoredRunRowSchema = z.object({ data: z.string() })
const StoredLeadDataRowSchema = z.object({ id: z.string(), data: z.string() })
const StoredRunLeadDataRowSchema = z.object({
  data: z.string(),
  lead_id: z.string(),
  run_id: z.string(),
})
const StoredQuarantineRowSchema = z.object({
  id: z.number().int(),
  data: z.string(),
})

export type CaptureRunInput = {
  readonly brief: string
  readonly leads: readonly Lead[]
  readonly limit: number
  readonly requestId?: string
  readonly requestedSource: RequestedSource
  readonly tabId: number
}

export class LeadStore {
  readonly #database: Database

  constructor(path?: string) {
    const databasePath = path ?? join(homedir(), ".ledry", "leads.sqlite")
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
    if (path === undefined) chmodSync(dirname(databasePath), 0o700)
    this.#database = new Database(databasePath, { create: true })
    this.#database.run("PRAGMA secure_delete = ON")
    this.#database.run("PRAGMA journal_mode = WAL")
    this.#database.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        data TEXT NOT NULL,
        qualification_status TEXT NOT NULL DEFAULT 'found'
      )
    `)
    this.#database.run(`
      CREATE TABLE IF NOT EXISTS research_runs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      )
    `)
    this.#database.run(`
      CREATE TABLE IF NOT EXISTS run_leads (
        run_id TEXT NOT NULL,
        lead_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        data TEXT,
        PRIMARY KEY (run_id, lead_id)
      )
    `)
    this.#database.run(`
      CREATE TABLE IF NOT EXISTS quarantined_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        data TEXT NOT NULL
      )
    `)
    this.#database.run(`
      CREATE TABLE IF NOT EXISTS capture_requests (
        request_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL
      )
    `)
    const quarantinedRows = StoredQuarantineRowSchema.array().parse(
      this.#database.query("SELECT id, data FROM quarantined_leads").all(),
    )
    for (const row of quarantinedRows) {
      let decoded: unknown
      try {
        decoded = JSON.parse(row.data)
      } catch {
        decoded = undefined
      }
      const sourceType =
        typeof decoded === "object" &&
        decoded !== null &&
        "sourceType" in decoded &&
        typeof decoded.sourceType === "string"
          ? decoded.sourceType
          : undefined
      const minimal = sourceType === undefined ? {} : { sourceType }
      this.#database.run("UPDATE quarantined_leads SET data = ? WHERE id = ?", [
        JSON.stringify(minimal),
        row.id,
      ])
    }
    const columns = ColumnSchema.array().parse(
      this.#database.query("PRAGMA table_info(leads)").all(),
    )
    if (!columns.some((column) => column.name === "qualification_status"))
      this.#database.run(
        "ALTER TABLE leads ADD COLUMN qualification_status TEXT NOT NULL DEFAULT 'found'",
      )
    const runLeadColumns = ColumnSchema.array().parse(
      this.#database.query("PRAGMA table_info(run_leads)").all(),
    )
    if (!runLeadColumns.some((column) => column.name === "data"))
      this.#database.run("ALTER TABLE run_leads ADD COLUMN data TEXT")
    this.#database.run(
      "UPDATE run_leads SET data = (SELECT data FROM leads WHERE leads.id = run_leads.lead_id) WHERE data IS NULL",
    )
    const existingRows = StoredLeadDataRowSchema.array().parse(
      this.#database.query("SELECT id, data FROM leads").all(),
    )
    for (const row of existingRows) {
      let decoded: unknown
      try {
        decoded = JSON.parse(row.data)
      } catch {
        decoded = undefined
      }
      const parsed = LeadSchema.safeParse(decoded)
      if (!parsed.success) {
        this.#database.run("DELETE FROM run_leads WHERE lead_id = ?", [row.id])
        this.#database.run("DELETE FROM leads WHERE id = ?", [row.id])
        continue
      }
      const original = parsed.data
      const normalized = prepareResearchResults([original], 1).accepted[0]
      if (normalized === undefined) {
        this.#database.run("DELETE FROM run_leads WHERE lead_id = ?", [row.id])
        this.#database.run("DELETE FROM leads WHERE id = ?", [row.id])
      } else if (JSON.stringify(normalized) !== JSON.stringify(original))
        this.#database.run("UPDATE leads SET data = ? WHERE id = ?", [
          JSON.stringify(normalized),
          row.id,
        ])
    }
    const runLeadRows = StoredRunLeadDataRowSchema.array().parse(
      this.#database
        .query(
          "SELECT run_id, lead_id, data FROM run_leads WHERE data IS NOT NULL",
        )
        .all(),
    )
    for (const row of runLeadRows) {
      let decoded: unknown
      try {
        decoded = JSON.parse(row.data)
      } catch {
        decoded = undefined
      }
      const parsed = LeadSchema.safeParse(decoded)
      const normalized = parsed.success
        ? prepareResearchResults([parsed.data], 1).accepted[0]
        : undefined
      if (normalized === undefined)
        this.#database.run(
          "DELETE FROM run_leads WHERE run_id = ? AND lead_id = ?",
          [row.run_id, row.lead_id],
        )
      else if (JSON.stringify(normalized) !== row.data)
        this.#database.run(
          "UPDATE run_leads SET data = ? WHERE run_id = ? AND lead_id = ?",
          [JSON.stringify(normalized), row.run_id, row.lead_id],
        )
    }
    for (const filePath of [
      databasePath,
      `${databasePath}-wal`,
      `${databasePath}-shm`,
    ]) {
      if (existsSync(filePath)) chmodSync(filePath, 0o600)
    }
  }

  save(leads: readonly Lead[]): number {
    const statement = this.#database.prepare(
      "INSERT INTO leads (id, source_url, captured_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET source_url = excluded.source_url, captured_at = excluded.captured_at, data = excluded.data",
    )
    const transaction = this.#database.transaction((items: readonly Lead[]) => {
      for (const lead of items)
        statement.run(
          lead.id,
          lead.sourceUrl,
          lead.capturedAt,
          JSON.stringify(lead),
        )
    })
    transaction(leads)
    return leads.length
  }

  list(): readonly Lead[] {
    return this.listRecords()
      .filter((record) => record.qualificationStatus !== "not-qualified")
      .map((record) => record.lead)
  }

  listRecords(runId?: string): readonly LeadRecord[] {
    const query =
      runId === undefined
        ? "SELECT data, qualification_status FROM leads ORDER BY captured_at DESC"
        : "SELECT COALESCE(run_leads.data, leads.data) AS data, leads.qualification_status FROM run_leads JOIN leads ON leads.id = run_leads.lead_id WHERE run_leads.run_id = ? ORDER BY run_leads.position"
    const rows = StoredLeadRowSchema.array().parse(
      runId === undefined
        ? this.#database.query(query).all()
        : this.#database.query(query).all(runId),
    )
    return rows.map((row) =>
      LeadRecordSchema.parse({
        lead: JSON.parse(row.data),
        qualificationStatus: row.qualification_status,
      }),
    )
  }

  captureRun(input: CaptureRunInput): ResearchRun {
    if (input.requestId !== undefined) {
      const existing = StoredRunRowSchema.safeParse(
        this.#database
          .query(
            "SELECT research_runs.data FROM capture_requests JOIN research_runs ON research_runs.id = capture_requests.run_id WHERE capture_requests.request_id = ?",
          )
          .get(input.requestId),
      )
      if (existing.success)
        return ResearchRunSchema.parse(JSON.parse(existing.data.data))
    }
    const startedAt = new Date().toISOString()
    const prepared = prepareResearchResults(input.leads, input.limit)
    const id = `run:${crypto.randomUUID()}`
    const actualSources = [
      ...new Set(prepared.accepted.map((lead) => lead.sourceType)),
    ].filter((source) => source !== "demo")
    const warnings = [
      ...(prepared.quarantined.length > 0
        ? [`${prepared.quarantined.length} unsafe candidate(s) quarantined`]
        : []),
      ...(prepared.skipped > 0
        ? [
            `${prepared.skipped} candidate(s) skipped after the ${input.limit}-lead limit`,
          ]
        : []),
      ...(prepared.accepted.some((lead) => lead.website.length === 0)
        ? ["Some leads do not have a confirmed business website"]
        : []),
    ]
    const report = ResearchRunSchema.parse({
      id,
      brief: input.brief,
      tabId: input.tabId,
      requestedSource: input.requestedSource,
      actualSources,
      limit: input.limit,
      discovered: input.leads.length,
      saved: prepared.accepted.length,
      quarantined: prepared.quarantined.length,
      skipped: prepared.skipped,
      status: prepared.accepted.length === 0 ? "empty" : "completed",
      warnings,
      startedAt,
      completedAt: new Date().toISOString(),
      recordIds: prepared.accepted.map((lead) => lead.id),
    })
    const transaction = this.#database.transaction(() => {
      this.save(prepared.accepted)
      this.#database.run(
        "INSERT INTO research_runs (id, created_at, data) VALUES (?, ?, ?)",
        [report.id, report.completedAt, JSON.stringify(report)],
      )
      if (input.requestId !== undefined)
        this.#database.run(
          "INSERT INTO capture_requests (request_id, run_id) VALUES (?, ?)",
          [input.requestId, report.id],
        )
      for (const [position, lead] of prepared.accepted.entries())
        this.#database.run(
          "INSERT INTO run_leads (run_id, lead_id, position, data) VALUES (?, ?, ?, ?)",
          [report.id, lead.id, position, JSON.stringify(lead)],
        )
      for (const item of prepared.quarantined)
        this.#database.run(
          "INSERT INTO quarantined_leads (run_id, reason, data) VALUES (?, ?, ?)",
          [
            report.id,
            item.reason,
            JSON.stringify({ sourceType: item.sourceType }),
          ],
        )
    })
    transaction()
    return report
  }

  listRuns(): readonly ResearchRun[] {
    const rows = StoredRunRowSchema.array().parse(
      this.#database
        .query("SELECT data FROM research_runs ORDER BY created_at DESC")
        .all(),
    )
    return rows.map((row) => ResearchRunSchema.parse(JSON.parse(row.data)))
  }

  updateQualification(id: string, status: QualificationStatus): boolean {
    const result = this.#database.run(
      "UPDATE leads SET qualification_status = ? WHERE id = ?",
      [status, id],
    )
    return result.changes === 1
  }

  close(): void {
    this.#database.close()
  }
}
