import type { AppConfig } from "./config"
import {
  type Health,
  HealthSchema,
  type Lead,
  type LeadRecord,
  LeadRecordSchema,
  LeadSchema,
  type QualificationStatus,
  QualificationStatusSchema,
  type RequestedSource,
  type ResearchResult,
  ResearchResultSchema,
  type ResearchRun,
  ResearchRunSchema,
  type Tab,
  TabSchema,
} from "./schemas"

export type { Health } from "./schemas"

export class DaemonClient {
  readonly #baseUrl: string
  readonly #token: string

  constructor(config: AppConfig) {
    this.#baseUrl = `http://127.0.0.1:${config.port}`
    this.#token = config.token
  }

  async health(): Promise<Health> {
    return HealthSchema.parse(
      await this.#request("/health").then((response) => response.json()),
    )
  }

  async tabs(): Promise<readonly Tab[]> {
    return TabSchema.array().parse(
      await this.#request("/tabs", true).then((response) => response.json()),
    )
  }

  async extract(
    tabId: number,
    sourceType: RequestedSource,
  ): Promise<readonly Lead[]> {
    const response = await this.#request("/extract", true, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId, sourceType }),
    })
    return LeadSchema.array().parse(await response.json())
  }

  async research(input: {
    readonly brief: string
    readonly limit: number
    readonly sourceType: RequestedSource
    readonly tabId: number
  }): Promise<ResearchResult> {
    const response = await this.#request("/research", true, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    return ResearchResultSchema.parse(await response.json())
  }

  async runs(): Promise<readonly ResearchRun[]> {
    return ResearchRunSchema.array().parse(
      await this.#request("/runs", true).then((response) => response.json()),
    )
  }

  async runRecords(id: string): Promise<readonly LeadRecord[]> {
    return LeadRecordSchema.array().parse(
      await this.#request(`/runs/${encodeURIComponent(id)}/records`, true).then(
        (response) => response.json(),
      ),
    )
  }

  async navigate(tabId: number, url: string): Promise<Tab> {
    const response = await this.#request("/navigate", true, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId, url }),
    })
    return TabSchema.parse(await response.json())
  }

  async scroll(tabId: number, amount: number): Promise<void> {
    await this.#request("/scroll", true, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId, amount }),
    })
  }

  async leads(): Promise<readonly Lead[]> {
    return LeadSchema.array().parse(
      await this.#request("/leads", true).then((response) => response.json()),
    )
  }

  async records(): Promise<readonly LeadRecord[]> {
    return LeadRecordSchema.array().parse(
      await this.#request("/records", true).then((response) => response.json()),
    )
  }

  async qualify(
    id: string,
    qualificationStatus: QualificationStatus,
  ): Promise<LeadRecord> {
    const response = await this.#request(
      `/records/${encodeURIComponent(id)}/qualification`,
      true,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qualificationStatus:
            QualificationStatusSchema.parse(qualificationStatus),
        }),
      },
    )
    return LeadRecordSchema.parse(await response.json())
  }

  async #request(
    path: string,
    authenticate = false,
    init?: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init?.headers)
    if (authenticate) headers.set("Authorization", `Bearer ${this.#token}`)
    const response = await fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok)
      throw new Error(
        `Daemon request failed (${response.status}): ${await response.text()}`,
      )
    return response
  }
}
