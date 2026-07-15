import type { Lead } from "../src/schemas"
import { sanitizePublicUrl } from "../src/url-policy"

export type RetryableCapture = {
  readonly expiresAt: number
  readonly requestId: string
  readonly signature: string
}

export const CAPTURE_RETRY_TTL_MS = 5 * 60 * 1_000

export interface CaptureRetryStorage {
  get(key: string): Promise<Record<string, unknown>>
  remove(key: string): Promise<void>
  set(values: Record<string, unknown>): Promise<void>
}

export async function loadRetryableCapture(
  storage: CaptureRetryStorage,
  now = Date.now(),
): Promise<RetryableCapture | undefined> {
  const stored = await storage.get("retryableCapture")
  const candidate: unknown = stored["retryableCapture"]
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("expiresAt" in candidate) ||
    !("requestId" in candidate) ||
    !("signature" in candidate) ||
    typeof candidate.expiresAt !== "number" ||
    typeof candidate.requestId !== "string" ||
    typeof candidate.signature !== "string"
  )
    return undefined
  const parsed = {
    expiresAt: candidate.expiresAt,
    requestId: candidate.requestId,
    signature: candidate.signature,
  }
  if (parsed.expiresAt <= now) {
    await storage.remove("retryableCapture")
    return undefined
  }
  return parsed
}

export async function saveRetryableCapture(
  storage: CaptureRetryStorage,
  capture: RetryableCapture,
): Promise<void> {
  await storage.set({ retryableCapture: capture })
}

export async function clearRetryableCapture(
  storage: CaptureRetryStorage,
  requestId: string,
): Promise<void> {
  const stored = await loadRetryableCapture(storage)
  if (stored?.requestId === requestId) await storage.remove("retryableCapture")
}

export async function createCaptureSignature(input: {
  readonly brief: string
  readonly leads: readonly Lead[]
  readonly limit: number
  readonly tabId: number
  readonly tabUrl: string
}): Promise<string> {
  const serialized = JSON.stringify({
    brief: input.brief,
    leads: input.leads.map((lead) => ({
      address: lead.address,
      category: lead.category,
      confidence: lead.confidence,
      emails: lead.emails,
      evidence: lead.evidence,
      id: lead.id,
      name: lead.name,
      organization: lead.organization,
      phones: lead.phones,
      score: lead.score,
      socialProfiles: lead.socialProfiles,
      sourceUrl: lead.sourceUrl,
      sourceType: lead.sourceType,
      tags: lead.tags,
      website: lead.website,
    })),
    limit: input.limit,
    tabId: input.tabId,
    url: sanitizePublicUrl(input.tabUrl),
  })
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  )
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
}
