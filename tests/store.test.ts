import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Lead } from "../src/schemas"
import { LeadStore } from "../src/store"

const directories: string[] = []

function quarantineData(database: Database): string {
  const row: unknown = database
    .query("SELECT data FROM quarantined_leads LIMIT 1")
    .get()
  if (
    typeof row !== "object" ||
    row === null ||
    !("data" in row) ||
    typeof row.data !== "string"
  )
    throw new Error("Quarantine audit row missing")
  return row.data
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true })
})

describe("LeadStore", () => {
  test("upserts leads by stable ID", () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-store-"))
    directories.push(directory)
    const store = new LeadStore(join(directory, "leads.sqlite"))
    const base = {
      id: "lead_1",
      name: "Acme",
      organization: "Acme",
      category: "",
      website: "https://acme.example",
      emails: [],
      phones: [],
      socialProfiles: [],
      address: "",
      sourceUrl: "https://acme.example",
      sourceType: "website",
      capturedAt: "2026-07-12T00:00:00.000Z",
      evidence: [],
      confidence: 0.8,
      score: 0,
      tags: ["public-business-page"],
    } satisfies Lead
    store.save([base])
    store.save([
      { ...base, name: "Acme Updated", capturedAt: "2026-07-12T01:00:00.000Z" },
    ])
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0]?.name).toBe("Acme Updated")
    expect(store.listRecords()[0]?.qualificationStatus).toBe("found")
    expect(store.updateQualification(base.id, "qualified")).toBe(true)
    store.save([{ ...base, name: "Acme Rescanned" }])
    expect(store.listRecords()[0]?.qualificationStatus).toBe("qualified")
    expect(store.list()).toHaveLength(1)
    expect(store.updateQualification(base.id, "not-qualified")).toBe(true)
    expect(store.list()).toHaveLength(0)
    expect(store.updateQualification("missing", "not-qualified")).toBe(false)
    store.close()
  })

  test("persists run-scoped reports and exact record membership", () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-store-"))
    directories.push(directory)
    const store = new LeadStore(join(directory, "leads.sqlite"))
    const captured = {
      id: "lead_run_1",
      name: "Run Coffee",
      organization: "Run Coffee",
      category: "Coffee roaster",
      website: "https://run.example",
      emails: [],
      phones: [],
      socialProfiles: [],
      address: "Pune",
      sourceUrl: "https://run.example",
      sourceType: "website",
      capturedAt: "2026-07-15T00:00:00.000Z",
      evidence: [],
      confidence: 0.8,
      score: 0,
      tags: ["public-business-page"],
    } satisfies Lead

    const report = store.captureRun({
      brief: "Coffee roasters in Pune",
      leads: [captured],
      limit: 5,
      requestedSource: "auto",
      tabId: 12,
    })

    expect(report.saved).toBe(1)
    expect(store.listRuns()).toEqual([report])
    expect(
      store.listRecords(report.id).map((record) => record.lead.id),
    ).toEqual([captured.id])
    store.captureRun({
      brief: "A later scan",
      leads: [{ ...captured, name: "Changed later" }],
      limit: 5,
      requestedSource: "auto",
      tabId: 12,
    })
    expect(store.listRecords(report.id)[0]?.lead.name).toBe("Run Coffee")
    store.close()
  })

  test("cleans legacy Google redirect websites when the store opens", () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-store-"))
    directories.push(directory)
    const path = join(directory, "leads.sqlite")
    const store = new LeadStore(path)
    store.save([
      {
        id: "legacy_maps",
        name: "Legacy Coffee",
        organization: "Legacy Coffee",
        category: "",
        website: "https://www.google.com/searchviewer/redirect",
        emails: [],
        phones: [],
        socialProfiles: [],
        address: "Pune",
        sourceUrl: "https://www.google.com/maps/place/Legacy+Coffee",
        sourceType: "google-maps",
        capturedAt: "2026-07-15T00:00:00.000Z",
        evidence: [],
        confidence: 0.7,
        score: 0,
        tags: [],
      },
    ])
    store.close()

    const reopened = new LeadStore(path)
    expect(reopened.list()[0]?.website).toBe("")
    reopened.close()
  })

  test("removes legacy unsafe leads and run snapshots when the store opens", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-store-"))
    directories.push(directory)
    const path = join(directory, "leads.sqlite")
    const store = new LeadStore(path)
    const unsafe = {
      id: "legacy_private_person",
      name: "Private Person",
      organization: "",
      category: "",
      website: "https://www.linkedin.com/in/private-person/",
      emails: ["private@example.com"],
      phones: [],
      socialProfiles: [],
      address: "",
      sourceUrl: "https://www.google.com/search?q=private+person",
      sourceType: "google-search",
      capturedAt: "2026-07-15T00:00:00.000Z",
      evidence: [],
      confidence: 0.5,
      score: 0,
      tags: [],
    } satisfies Lead
    store.save([unsafe])
    const run = store.captureRun({
      brief: "Legacy unsafe result",
      leads: [unsafe],
      limit: 1,
      requestedSource: "google-search",
      tabId: 7,
    })
    store.close()

    const database = new Database(path)
    database.run(
      "INSERT OR REPLACE INTO leads (id, source_url, captured_at, data, qualification_status) VALUES (?, ?, ?, ?, 'found')",
      [unsafe.id, unsafe.sourceUrl, unsafe.capturedAt, JSON.stringify(unsafe)],
    )
    database.run(
      "INSERT OR REPLACE INTO run_leads (run_id, lead_id, position, data) VALUES (?, ?, 0, ?)",
      [run.id, unsafe.id, JSON.stringify(unsafe)],
    )
    database.close()

    const reopened = new LeadStore(path)
    expect(reopened.listRecords()).toEqual([])
    expect(reopened.listRecords(run.id)).toEqual([])
    reopened.close()
    const contents = await Bun.file(path).text()
    expect(contents).not.toContain("private@example.com")
  })

  test("removes malformed legacy rows before records are read", () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-store-"))
    directories.push(directory)
    const path = join(directory, "leads.sqlite")
    const store = new LeadStore(path)
    store.close()
    const database = new Database(path)
    database.run(
      "INSERT INTO leads (id, source_url, captured_at, data, qualification_status) VALUES (?, ?, ?, ?, 'found')",
      [
        "malformed",
        "https://example.com/",
        "2026-07-15T00:00:00.000Z",
        "private@example.com",
      ],
    )
    database.close()

    const reopened = new LeadStore(path)
    expect(reopened.listRecords()).toEqual([])
    reopened.close()
  })

  test("returns the same durable run when a capture request is retried", () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-store-"))
    directories.push(directory)
    const store = new LeadStore(join(directory, "leads.sqlite"))
    const lead = {
      id: "lead_retry",
      name: "Retry Coffee",
      organization: "Retry Coffee",
      category: "Coffee roaster",
      website: "https://retry.example",
      emails: [],
      phones: [],
      socialProfiles: [],
      address: "Pune",
      sourceUrl: "https://retry.example",
      sourceType: "website",
      capturedAt: "2026-07-15T00:00:00.000Z",
      evidence: [],
      confidence: 0.8,
      score: 0,
      tags: ["public-business-page"],
    } satisfies Lead
    const input = {
      brief: "Retry test",
      leads: [lead],
      limit: 5,
      requestId: crypto.randomUUID(),
      requestedSource: "auto" as const,
      tabId: 12,
    }

    const first = store.captureRun(input)
    const retried = store.captureRun(input)

    expect(retried).toEqual(first)
    expect(store.listRuns()).toEqual([first])
    store.close()
  })

  test("stores only non-sensitive metadata for quarantined candidates", () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-store-"))
    directories.push(directory)
    const path = join(directory, "leads.sqlite")
    const store = new LeadStore(path)
    store.captureRun({
      brief: "Unsafe candidate",
      leads: [
        {
          id: "private-person",
          name: "Private Person",
          organization: "",
          category: "",
          website: "https://www.instagram.com/private-person/",
          emails: ["private.person@example.com"],
          phones: [],
          socialProfiles: [],
          address: "",
          sourceUrl: "https://www.instagram.com/private-person/",
          sourceType: "social",
          capturedAt: "2026-07-15T00:00:00.000Z",
          evidence: [],
          confidence: 0.5,
          score: 0,
          tags: [],
        },
      ],
      limit: 5,
      requestedSource: "social",
      tabId: 12,
    })
    const audit = new Database(path, { readonly: true })
    const stored = quarantineData(audit)

    expect(stored).toBe(JSON.stringify({ sourceType: "social" }))
    expect(stored).not.toContain("private.person@example.com")
    audit.close()
    store.close()

    const reopened = new LeadStore(path)
    const reopenedAudit = new Database(path, { readonly: true })
    const reopenedStored = quarantineData(reopenedAudit)
    expect(reopenedStored).toBe(JSON.stringify({ sourceType: "social" }))
    reopenedAudit.close()
    reopened.close()
  })
})
