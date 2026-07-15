import { describe, expect, test } from "bun:test"
import {
  type CaptureRetryStorage,
  clearRetryableCapture,
  createCaptureSignature,
  loadRetryableCapture,
  saveRetryableCapture,
} from "../extension/capture-retry"
import type { Lead } from "../src/schemas"

class MemoryStorage implements CaptureRetryStorage {
  constructor(private readonly values = new Map<string, unknown>()) {}

  async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.values.get(key) }
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key)
  }

  async set(values: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(values))
      this.values.set(key, value)
  }

  restart(): MemoryStorage {
    return new MemoryStorage(this.values)
  }
}

const lead = {
  id: "lead:retry",
  name: "Retry Coffee",
  organization: "Retry Coffee",
  category: "Coffee roaster",
  website: "https://retry.example/",
  emails: [],
  phones: [],
  socialProfiles: [],
  address: "Pune",
  sourceUrl: "https://retry.example/",
  sourceType: "website",
  capturedAt: "2026-07-15T00:00:00.000Z",
  evidence: [],
  confidence: 0.8,
  score: 0,
  tags: ["public-business-page"],
} satisfies Lead

describe("capture retry state", () => {
  test("survives worker restart until the matching acknowledgement", async () => {
    const storage = new MemoryStorage()
    const signature = await createCaptureSignature({
      brief: "Coffee roasters",
      leads: [lead],
      limit: 5,
      tabId: 7,
      tabUrl: "https://retry.example/",
    })
    const capture = {
      expiresAt: Date.now() + 60_000,
      requestId: crypto.randomUUID(),
      signature,
    }
    await saveRetryableCapture(storage, capture)

    const restartedStorage = storage.restart()
    expect(await loadRetryableCapture(restartedStorage)).toEqual(capture)
    await clearRetryableCapture(restartedStorage, "different-request")
    expect(await loadRetryableCapture(restartedStorage)).toEqual(capture)
    await clearRetryableCapture(restartedStorage, capture.requestId)
    expect(await loadRetryableCapture(restartedStorage)).toBeUndefined()
  })

  test("changes the signature when the page or captured leads change", async () => {
    const base = {
      brief: "Coffee roasters",
      leads: [lead],
      limit: 5,
      tabId: 7,
      tabUrl: "https://retry.example/",
    }
    const signature = await createCaptureSignature(base)

    expect(
      await createCaptureSignature({
        ...base,
        tabUrl: "https://different.example/",
      }),
    ).not.toBe(signature)
    expect(
      await createCaptureSignature({
        ...base,
        leads: [{ ...lead, name: "Different lead" }],
      }),
    ).not.toBe(signature)
    for (const changedLead of [
      { ...lead, category: "Cafe" },
      { ...lead, organization: "Retry Group" },
      { ...lead, socialProfiles: ["https://linkedin.com/company/retry"] },
      {
        ...lead,
        evidence: [
          {
            field: "name",
            sourceUrl: "https://retry.example/",
            value: "Retry Coffee",
          },
        ],
      },
      { ...lead, confidence: 0.9 },
      { ...lead, score: 9 },
      { ...lead, tags: [...lead.tags, "verified"] },
      { ...lead, sourceType: "social" as const },
    ])
      expect(
        await createCaptureSignature({ ...base, leads: [changedLead] }),
      ).not.toBe(signature)
    expect(
      await createCaptureSignature({
        ...base,
        leads: [{ ...lead, capturedAt: "2026-07-15T01:00:00.000Z" }],
      }),
    ).toBe(signature)
  })

  test("removes expired retry state instead of reusing an old request", async () => {
    const storage = new MemoryStorage()
    await saveRetryableCapture(storage, {
      expiresAt: 100,
      requestId: crypto.randomUUID(),
      signature: "expired",
    })

    expect(await loadRetryableCapture(storage, 101)).toBeUndefined()
    expect(await loadRetryableCapture(storage, 101)).toBeUndefined()
  })
})
