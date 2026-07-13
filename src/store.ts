import { Database } from "bun:sqlite"
import { chmodSync, existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { z } from "zod"
import {
  type Lead,
  type LeadRecord,
  LeadRecordSchema,
  type QualificationStatus,
} from "./schemas"

const StoredLeadRowSchema = z.object({
  data: z.string(),
  qualification_status: z.string(),
})
const ColumnSchema = z.object({ name: z.string() })

export class LeadStore {
  readonly #database: Database

  constructor(path?: string) {
    const databasePath = path ?? join(homedir(), ".ledry", "leads.sqlite")
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
    if (path === undefined) chmodSync(dirname(databasePath), 0o700)
    this.#database = new Database(databasePath, { create: true })
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
    const columns = ColumnSchema.array().parse(
      this.#database.query("PRAGMA table_info(leads)").all(),
    )
    if (!columns.some((column) => column.name === "qualification_status"))
      this.#database.run(
        "ALTER TABLE leads ADD COLUMN qualification_status TEXT NOT NULL DEFAULT 'found'",
      )
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
    return this.listRecords().map((record) => record.lead)
  }

  listRecords(): readonly LeadRecord[] {
    const rows = StoredLeadRowSchema.array().parse(
      this.#database
        .query(
          "SELECT data, qualification_status FROM leads ORDER BY captured_at DESC",
        )
        .all(),
    )
    return rows.map((row) =>
      LeadRecordSchema.parse({
        lead: JSON.parse(row.data),
        qualificationStatus: row.qualification_status,
      }),
    )
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
