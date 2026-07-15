import {
  type BrowserCommand,
  type ExtensionMessage,
  type Lead,
  LeadSchema,
  type RequestedSource,
  type Tab,
  TabSchema,
} from "./schemas"

type PendingRequest = {
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}

export class BridgeUnavailableError extends Error {
  constructor() {
    super("No authenticated browser extension is connected")
    this.name = "BridgeUnavailableError"
  }
}

export class BrowserBridge {
  #socket: Bun.ServerWebSocket<unknown> | undefined
  readonly #pending = new Map<string, PendingRequest>()

  get connected(): boolean {
    return this.#socket !== undefined
  }

  attach(socket: Bun.ServerWebSocket<unknown>): boolean {
    if (this.#socket !== undefined && this.#socket !== socket) return false
    this.#socket = socket
    return true
  }

  detach(socket: Bun.ServerWebSocket<unknown>): void {
    if (this.#socket !== socket) return
    this.#socket = undefined
    for (const request of this.#pending.values()) {
      clearTimeout(request.timer)
      request.reject(new BridgeUnavailableError())
    }
    this.#pending.clear()
  }

  settle(
    socket: Bun.ServerWebSocket<unknown>,
    message: ExtensionMessage,
  ): void {
    if (this.#socket !== socket) return
    if (message.type !== "result") return
    const request = this.#pending.get(message.requestId)
    if (request === undefined) return
    clearTimeout(request.timer)
    this.#pending.delete(message.requestId)
    if (message.ok) request.resolve(message.data)
    else request.reject(new Error(message.error))
  }

  async tabs(): Promise<readonly Tab[]> {
    const data = await this.#send({
      requestId: crypto.randomUUID(),
      action: "tabs.list",
    })
    return TabSchema.array().parse(data)
  }

  async extract(
    tabId: number,
    sourceType: RequestedSource,
  ): Promise<readonly Lead[]> {
    const data = await this.#send({
      requestId: crypto.randomUUID(),
      action: "leads.extract",
      tabId,
      sourceType,
    })
    return LeadSchema.array().max(500).parse(data)
  }

  async navigate(tabId: number, url: string): Promise<Tab> {
    const data = await this.#send({
      requestId: crypto.randomUUID(),
      action: "tab.navigate",
      tabId,
      url,
    })
    return TabSchema.parse(data)
  }

  async scroll(tabId: number, amount: number): Promise<void> {
    await this.#send({
      requestId: crypto.randomUUID(),
      action: "page.scroll",
      tabId,
      amount,
    })
  }

  async #send(command: BrowserCommand): Promise<unknown> {
    const socket = this.#socket
    if (socket === undefined) throw new BridgeUnavailableError()
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(command.requestId)
        reject(new Error(`Browser command timed out: ${command.action}`))
      }, 15_000)
      this.#pending.set(command.requestId, { resolve, reject, timer })
      socket.send(JSON.stringify({ type: "command", ...command }))
    })
  }
}
