import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { WebSocket } from "ws"
import { DaemonClient } from "../src/client"
import type { AppConfig } from "../src/config"
import type { Lead } from "../src/schemas"
import { type BridgeServer, startBridgeServer } from "../src/server"
import { LeadStore } from "../src/store"

const servers: BridgeServer[] = []
const directories: string[] = []

const savedLead = {
  id: "lead_dashboard",
  name: "Katha Coffee Works",
  organization: "Katha Coffee Works",
  category: "Coffee roaster",
  website: "https://katha.example",
  emails: ["hello@katha.example"],
  phones: [],
  socialProfiles: [],
  address: "Pune",
  sourceUrl: "https://katha.example",
  sourceType: "website",
  capturedAt: "2026-07-13T08:30:00.000Z",
  evidence: [],
  confidence: 0.87,
  score: 82,
  tags: [],
} satisfies Lead

afterEach(() => {
  for (const server of servers.splice(0)) server.stop()
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true })
})

async function connectedHarness(): Promise<{
  readonly client: DaemonClient
  readonly socket: WebSocket
}> {
  const directory = mkdtempSync(join(tmpdir(), "ledry-server-"))
  directories.push(directory)
  const config = { token: "test_token_1234567890", port: 0 } satisfies AppConfig
  const server = startBridgeServer(
    config,
    new LeadStore(join(directory, "leads.sqlite")),
  )
  servers.push(server)
  const actualConfig = { ...config, port: server.port }
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/extension`, {
    headers: { Origin: "chrome-extension://testextensionid" },
  })
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          type: "hello",
          token: config.token,
          clientId: "test-extension",
          version: "0.1.0",
        }),
      )
    })
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data))
      if (message.type === "hello_ack") resolve()
      if (message.type === "error") reject(new Error(String(message.message)))
    })
    socket.addEventListener("error", () =>
      reject(new Error("WebSocket connection failed")),
    )
    socket.addEventListener("close", (event) =>
      reject(new Error(`WebSocket closed ${event.code}: ${event.reason}`)),
    )
  })
  return { client: new DaemonClient(actualConfig), socket }
}

describe("local bridge", () => {
  test("rejects WebSocket connections from web origins", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-origin-"))
    directories.push(directory)
    const server = startBridgeServer(
      { token: "test_token_1234567890", port: 0 },
      new LeadStore(join(directory, "leads.sqlite")),
    )
    servers.push(server)
    const response = await fetch(`http://127.0.0.1:${server.port}/extension`, {
      headers: { Origin: "https://attacker.example" },
    })
    expect(response.status).toBe(403)
  })

  test("rejects DNS-rebinding host headers before issuing a session", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-host-"))
    directories.push(directory)
    const server = startBridgeServer(
      { token: "test_token_1234567890", port: 0 },
      new LeadStore(join(directory, "leads.sqlite")),
    )
    servers.push(server)
    const response = await fetch(`http://127.0.0.1:${server.port}/`, {
      headers: { Host: "attacker.example" },
    })
    expect(response.status).toBe(403)
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  test("authenticates an extension and returns tabs", async () => {
    const { client, socket } = await connectedHarness()
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data))
      if (message.action === "tabs.list") {
        socket.send(
          JSON.stringify({
            type: "result",
            requestId: message.requestId,
            ok: true,
            data: [
              {
                id: 7,
                title: "Coffee shops",
                url: "https://www.google.com/maps/search/coffee",
              },
            ],
          }),
        )
      }
    })
    expect((await client.health()).extensionConnected).toBe(true)
    expect(await client.tabs()).toEqual([
      {
        id: 7,
        title: "Coffee shops",
        url: "https://www.google.com/maps/search/coffee",
      },
    ])
    socket.close()
  })

  test("navigates and scrolls only through the authenticated extension", async () => {
    const { client, socket } = await connectedHarness()
    const actions: string[] = []
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data))
      if (typeof message.action !== "string") return
      actions.push(message.action)
      const data =
        message.action === "tab.navigate"
          ? {
              id: message.tabId,
              title: "Coffee roasters",
              url: message.url,
            }
          : { scrolled: message.amount }
      socket.send(
        JSON.stringify({
          type: "result",
          requestId: message.requestId,
          ok: true,
          data,
        }),
      )
    })
    expect(
      await client.navigate(
        7,
        "https://www.google.com/search?q=coffee+roasters+pune",
      ),
    ).toMatchObject({ id: 7, title: "Coffee roasters" })
    await client.scroll(7, 1200)
    expect(actions).toEqual(["tab.navigate", "page.scroll"])
    socket.close()
  })

  test("rejects a second authenticated extension socket", async () => {
    const { socket } = await connectedHarness()
    const port = servers[0]?.port
    expect(port).toBeNumber()
    const second = new WebSocket(`ws://127.0.0.1:${port}/extension`, {
      headers: { Origin: "chrome-extension://testextensionid" },
    })
    const closeCode = await new Promise<number>((resolve, reject) => {
      second.addEventListener("open", () => {
        second.send(
          JSON.stringify({
            type: "hello",
            token: "test_token_1234567890",
            clientId: "second-extension",
            version: "0.1.0",
          }),
        )
      })
      second.addEventListener("close", (event) => resolve(event.code))
      second.addEventListener("error", reject)
    })
    expect(closeCode).toBe(1008)
    socket.close()
  })

  test("rejects an unauthenticated API request", async () => {
    const { client, socket } = await connectedHarness()
    const health = await client.health()
    expect(health.status).toBe("ok")
    const response = await fetch(`http://127.0.0.1:${servers[0]?.port}/leads`)
    expect(response.status).toBe(401)
    socket.close()
  })

  test("returns structured service-unavailable errors", async () => {
    const { socket } = await connectedHarness()
    await new Promise<void>((resolve) => {
      socket.addEventListener("close", () => resolve())
      socket.close()
    })
    const response = await fetch(`http://127.0.0.1:${servers[0]?.port}/tabs`, {
      headers: { Authorization: "Bearer test_token_1234567890" },
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: "No authenticated browser extension is connected",
    })
  })

  test("serves a secured dashboard and persists browser qualification", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-dashboard-"))
    directories.push(directory)
    const store = new LeadStore(join(directory, "leads.sqlite"))
    store.save([savedLead])
    const config = {
      token: "test_token_1234567890",
      port: 0,
    } satisfies AppConfig
    const server = startBridgeServer(config, store)
    servers.push(server)
    const origin = `http://127.0.0.1:${server.port}`
    const page = await fetch(origin)
    const cookie = page.headers.get("set-cookie")?.split(";")[0]

    expect(page.status).toBe(200)
    expect(await page.text()).toContain("Ledry Workspace")
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    )
    expect(cookie).toStartWith("ledry_session=")
    if (cookie === undefined) throw new Error("Dashboard cookie missing")

    const unauthorized = await fetch(`${origin}/api/dashboard`)
    expect(unauthorized.status).toBe(401)
    const dashboard = await fetch(`${origin}/api/dashboard`, {
      headers: { Cookie: cookie },
    })
    expect(dashboard.status).toBe(200)
    expect(await dashboard.json()).toMatchObject({
      health: { extensionConnected: false },
      records: [{ qualificationStatus: "found" }],
    })

    const rejectedMutation = await fetch(
      `${origin}/api/records/${savedLead.id}/qualification`,
      {
        method: "PATCH",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ qualificationStatus: "qualified" }),
      },
    )
    expect(rejectedMutation.status).toBe(403)

    const acceptedMutation = await fetch(
      `${origin}/api/records/${savedLead.id}/qualification`,
      {
        method: "PATCH",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify({ qualificationStatus: "qualified" }),
      },
    )
    expect(acceptedMutation.status).toBe(200)
    expect(await acceptedMutation.json()).toMatchObject({
      qualificationStatus: "qualified",
    })
    expect(store.listRecords()[0]?.qualificationStatus).toBe("qualified")
  })

  test("allows authenticated CLI clients to update qualification", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-records-"))
    directories.push(directory)
    const store = new LeadStore(join(directory, "leads.sqlite"))
    store.save([savedLead])
    const config = {
      token: "test_token_1234567890",
      port: 0,
    } satisfies AppConfig
    const server = startBridgeServer(config, store)
    servers.push(server)
    const client = new DaemonClient({ ...config, port: server.port })

    expect(await client.records()).toHaveLength(1)
    expect(
      (await client.qualify(savedLead.id, "not-qualified")).qualificationStatus,
    ).toBe("not-qualified")
  })
})
