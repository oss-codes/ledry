import { type BrowserCommand, BrowserCommandSchema } from "../src/schemas"
import {
  approvedTabs,
  approveTab,
  assertApprovedTab,
  navigateApprovedTab,
} from "./approved-tabs"
import { isAllowedUrl } from "./policy"

let socket: WebSocket | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let keepaliveTimer: ReturnType<typeof setInterval> | undefined

async function readConfig(): Promise<{
  readonly port: number
  readonly token: string
}> {
  const values = await chrome.storage.local.get(["port", "token"])
  return {
    port: typeof values["port"] === "number" ? values["port"] : 43110,
    token: typeof values["token"] === "string" ? values["token"] : "",
  }
}

function connect(): void {
  if (socket !== undefined) return
  if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
  reconnectTimer = undefined
  void readConfig().then((config) => {
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
  if (keepaliveTimer !== undefined) clearInterval(keepaliveTimer)
  keepaliveTimer = undefined
  void chrome.action.setBadgeText({ text: "" })
  if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, 2_000)
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
    void chrome.action.setBadgeText({ text: "ON" })
    void chrome.action.setBadgeBackgroundColor({ color: "#16a34a" })
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

async function execute(command: BrowserCommand): Promise<unknown> {
  switch (command.action) {
    case "tabs.list": {
      const [tabs, approved] = await Promise.all([
        chrome.tabs.query({}),
        approvedTabs(),
      ])
      return tabs.flatMap((tab) => {
        if (
          tab.id === undefined ||
          tab.url === undefined ||
          !isAllowedUrl(tab.url)
        )
          return []
        const origin = new URL(tab.url).origin
        return approved.some(
          (item) => item.id === tab.id && item.origin === origin,
        )
          ? [{ id: tab.id, title: tab.title ?? "Untitled", url: tab.url }]
          : []
      })
    }
    case "tab.attach":
      await assertApprovedTab(command.tabId)
      await chrome.tabs.update(command.tabId, { active: true })
      return { attached: true }
    case "tab.navigate":
      return await navigateApprovedTab(command.tabId, command.url)
    case "page.snapshot":
      await assertApprovedTab(command.tabId)
      return await chrome.tabs.sendMessage(command.tabId, {
        action: "snapshot",
      })
    case "page.scroll":
      await assertApprovedTab(command.tabId)
      return await chrome.tabs.sendMessage(command.tabId, {
        action: "scroll",
        amount: command.amount,
      })
    case "leads.extract":
      await assertApprovedTab(command.tabId)
      return await chrome.tabs.sendMessage(command.tabId, {
        action: "extract",
        sourceType: command.sourceType,
      })
    default:
      return command satisfies never
  }
}

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName !== "local") return
  if (socket === undefined) connect()
  else socket.close()
})
chrome.runtime.onInstalled.addListener(
  () => void chrome.runtime.openOptionsPage(),
)
chrome.action.onClicked.addListener((tab) => void approveTab(tab))
connect()
