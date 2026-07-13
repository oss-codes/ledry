import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Lead } from "../src/schemas"
import { LeadStore } from "../src/store"

const directories: string[] = []

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
      tags: [],
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
    expect(store.updateQualification("missing", "not-qualified")).toBe(false)
    store.close()
  })
})
