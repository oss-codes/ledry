import {
  type BrowserCommand,
  BrowserCommandSchema,
  ExtensionCaptureAckSchema,
  type Lead,
  LeadSchema,
  type ResearchRun,
} from "../src/schemas"
import { configureActionPopup } from "./action-behavior"
import {
  assertApprovedTab,
  listApprovedTabs,
  navigateApprovedTab,
} from "./approved-tabs"
import {
  CAPTURE_RETRY_TTL_MS,
  type CaptureRetryStorage,
  clearRetryableCapture,
  createCaptureSignature,
  loadRetryableCapture,
  saveRetryableCapture,
} from "./capture-retry"
import {
  readExtensionConfig,
  registerSidepanelMessages,
} from "./sidepanel-service"
import { connectionConfigChanged } from "./storage-policy"

let socket: WebSocket | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let keepaliveTimer: ReturnType<typeof setInterval> | undefined
let bridgeAuthenticated = false
const captureRetryStorage: CaptureRetryStorage = {
  async get(key) {
    return await chrome.storage.session.get(key)
  },
  async remove(key) {
    await chrome.storage.session.remove(key)
  },
  async set(values) {
    await chrome.storage.session.set(values)
  },
}
const pendingCaptures = new Map<
  string,
  {
    readonly reject: (error: Error) => void
    readonly resolve: (run: ResearchRun) => void
    readonly timer: ReturnType<typeof setTimeout>
  }
>()

async function sendPageMessage(
  tabId: number,
  message: object,
): Promise<unknown> {
  const response: unknown = await chrome.tabs.sendMessage(tabId, message)
  if (
    typeof response === "object" &&
    response !== null &&
    "ledryError" in response &&
    typeof response.ledryError === "string"
  )
    throw new Error(response.ledryError)
  return response
}

function connect(): void {
  if (socket !== undefined) return
  bridgeAuthenticated = false
  if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
  reconnectTimer = undefined
  void readExtensionConfig().then((config) => {
    if (config.token.length < 16) return
    const nextSocket = new WebSocket(`ws://127.0.0.1:${config.port}/extension`)
    const hello = JSON.stringify({
      type: "hello",
      token: config.token,
      clientId: chrome.runtime.id,
      version: "0.1.0",
    })
    socket = nextSocket
    nextSocket.addEventListener("open", () => {
      if (socket !== nextSocket) {
        nextSocket.close()
        return
      }
      nextSocket.send(hello)
      if (keepaliveTimer !== undefined) clearInterval(keepaliveTimer)
      keepaliveTimer = setInterval(() => {
        if (nextSocket.readyState === WebSocket.OPEN) nextSocket.send(hello)
      }, 20_000)
    })
    nextSocket.addEventListener(
      "message",
      (event) => void handleMessage(nextSocket, String(event.data)),
    )
    nextSocket.addEventListener("close", () => scheduleReconnect(nextSocket))
    nextSocket.addEventListener("error", () => nextSocket.close())
  })
}

function scheduleReconnect(closedSocket: WebSocket): void {
  if (socket !== closedSocket) return
  socket = undefined
  bridgeAuthenticated = false
  if (keepaliveTimer !== undefined) clearInterval(keepaliveTimer)
  keepaliveTimer = undefined
  rejectPendingCaptures(
    new Error("The Ledry bridge disconnected during capture"),
  )
  void chrome.action.setBadgeText({ text: "" })
  if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, 2_000)
}

function rejectPendingCaptures(error: Error): void {
  for (const pending of pendingCaptures.values()) {
    clearTimeout(pending.timer)
    pending.reject(error)
  }
  pendingCaptures.clear()
}

async function handleMessage(
  responseSocket: WebSocket,
  raw: string,
): Promise<void> {
  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch (error) {
    responseSocket.send(
      JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "Invalid message",
      }),
    )
    return
  }
  if (
    typeof decoded === "object" &&
    decoded !== null &&
    "type" in decoded &&
    decoded.type === "hello_ack"
  ) {
    bridgeAuthenticated = true
    void chrome.action.setBadgeText({ text: "ON" })
    void chrome.action.setBadgeBackgroundColor({ color: "#16a34a" })
    return
  }
  const captureAck = ExtensionCaptureAckSchema.safeParse(decoded)
  if (captureAck.success) {
    const pending = pendingCaptures.get(captureAck.data.requestId)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    pendingCaptures.delete(captureAck.data.requestId)
    await clearRetryableCapture(captureRetryStorage, captureAck.data.requestId)
    if (captureAck.data.ok) {
      pending.resolve(captureAck.data.run)
    } else pending.reject(new Error(captureAck.data.error))
    return
  }
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("type" in decoded) ||
    decoded.type !== "command"
  )
    return
  const command = BrowserCommandSchema.parse(decoded)
  try {
    const data = await execute(command)
    responseSocket.send(
      JSON.stringify({
        type: "result",
        requestId: command.requestId,
        ok: true,
        data,
      }),
    )
  } catch (error) {
    responseSocket.send(
      JSON.stringify({
        type: "result",
        requestId: command.requestId,
        ok: false,
        error:
          error instanceof Error ? error.message : "Browser command failed",
      }),
    )
  }
}

async function captureFromPanel(
  tabId: number,
  limit: number,
  brief: string,
): Promise<ResearchRun> {
  await assertApprovedTab(tabId)
  const activeSocket = socket
  if (
    activeSocket === undefined ||
    activeSocket.readyState !== WebSocket.OPEN ||
    !bridgeAuthenticated
  )
    throw new Error("Start the Ledry bridge before capturing leads")
  const leads = LeadSchema.array()
    .max(500)
    .parse(
      await sendPageMessage(tabId, {
        action: "extract",
        sourceType: "auto",
      }),
    ) satisfies readonly Lead[]
  const tab = await chrome.tabs.get(tabId)
  if (tab.url === undefined)
    throw new Error("The browser did not report the approved tab URL")
  const signature = await createCaptureSignature({
    brief,
    leads,
    limit,
    tabId,
    tabUrl: tab.url,
  })
  const retryableCapture = await loadRetryableCapture(captureRetryStorage)
  const requestId =
    retryableCapture !== undefined && retryableCapture.signature === signature
      ? retryableCapture.requestId
      : crypto.randomUUID()
  await saveRetryableCapture(captureRetryStorage, {
    expiresAt: Date.now() + CAPTURE_RETRY_TTL_MS,
    requestId,
    signature,
  })
  return await new Promise<ResearchRun>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCaptures.delete(requestId)
      reject(new Error("Lead capture timed out"))
    }, 20_000)
    pendingCaptures.set(requestId, { reject, resolve, timer })
    try {
      activeSocket.send(
        JSON.stringify({
          type: "capture",
          requestId,
          tabId,
          sourceType: "auto",
          limit,
          brief,
          leads,
        }),
      )
    } catch (error) {
      clearTimeout(timer)
      pendingCaptures.delete(requestId)
      reject(error instanceof Error ? error : new Error("Capture failed"))
    }
  })
}

async function execute(command: BrowserCommand): Promise<unknown> {
  switch (command.action) {
    case "tabs.list": {
      return await listApprovedTabs()
    }
    case "tab.attach":
      await assertApprovedTab(command.tabId)
      await chrome.tabs.update(command.tabId, { active: true })
      return { attached: true }
    case "tab.navigate":
      return await navigateApprovedTab(command.tabId, command.url)
    case "page.snapshot":
      await assertApprovedTab(command.tabId)
      return await sendPageMessage(command.tabId, {
        action: "snapshot",
      })
    case "page.scroll":
      await assertApprovedTab(command.tabId)
      return await sendPageMessage(command.tabId, {
        action: "scroll",
        amount: command.amount,
      })
    case "leads.extract":
      await assertApprovedTab(command.tabId)
      return await sendPageMessage(command.tabId, {
        action: "extract",
        sourceType: command.sourceType,
      })
    default:
      return command satisfies never
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!connectionConfigChanged(changes, areaName)) return
  if (socket === undefined) connect()
  else socket.close()
})
registerSidepanelMessages(() => bridgeAuthenticated, captureFromPanel)
chrome.runtime.onInstalled.addListener(() => {
  void configureActionPopup()
  void chrome.runtime.openOptionsPage()
})
void configureActionPopup()
connect()
