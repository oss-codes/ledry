import { z } from "zod"
import { BridgeUnavailableError, BrowserBridge } from "./bridge"
import type { AppConfig } from "./config"
import { handleDashboardRequest } from "./dashboard"
import { ExtensionMessageSchema, QualificationStatusSchema } from "./schemas"
import type { LeadStore } from "./store"

const ExtractRequestSchema = z.object({
  tabId: z.number().int().nonnegative(),
  sourceType: z.enum(["google-maps", "google-search", "website", "social"]),
})
const QualificationRequestSchema = z.object({
  qualificationStatus: QualificationStatusSchema,
})
const NavigateRequestSchema = z.object({
  tabId: z.number().int().nonnegative(),
  url: z.url().max(4096),
})
const ScrollRequestSchema = z.object({
  tabId: z.number().int().nonnegative(),
  amount: z.number().int().min(100).max(3000),
})

type SocketState = { authenticated: boolean }

export type BridgeServer = {
  readonly port: number
  readonly bridge: BrowserBridge
  stop(): void
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function authorized(request: Request, token: string): boolean {
  return request.headers.get("Authorization") === `Bearer ${token}`
}

export function startBridgeServer(
  config: AppConfig,
  store: LeadStore,
): BridgeServer {
  const bridge = new BrowserBridge()
  const sessionToken = crypto.randomUUID().replaceAll("-", "")
  let actualPort = config.port
  const server = Bun.serve<SocketState>({
    hostname: "127.0.0.1",
    port: config.port,
    async fetch(request, bunServer) {
      const url = new URL(request.url)
      if (request.headers.get("Host") !== `127.0.0.1:${actualPort}`)
        return json({ error: "Loopback host required" }, 403)
      const dashboardResponse = await handleDashboardRequest(request, {
        bridge,
        expectedOrigin: `http://127.0.0.1:${actualPort}`,
        sessionToken,
        store,
        token: config.token,
      })
      if (dashboardResponse !== undefined) return dashboardResponse
      if (url.pathname === "/extension") {
        const origin = request.headers.get("Origin")
        if (origin === null || !origin.startsWith("chrome-extension://"))
          return json({ error: "Extension origin required" }, 403)
        const upgraded = bunServer.upgrade(request, {
          data: { authenticated: false },
        })
        return upgraded
          ? undefined
          : new Response("Upgrade required", { status: 426 })
      }
      if (url.pathname === "/health") {
        return json({
          status: "ok",
          extensionConnected: bridge.connected,
          version: "0.1.0",
        })
      }
      if (!authorized(request, config.token))
        return json({ error: "Unauthorized" }, 401)
      if (Number(request.headers.get("Content-Length") ?? "0") > 65_536)
        return json({ error: "Request too large" }, 413)
      if (request.method === "GET" && url.pathname === "/tabs") {
        return json(await bridge.tabs())
      }
      if (request.method === "POST" && url.pathname === "/extract") {
        const input = ExtractRequestSchema.parse(await request.json())
        const leads = await bridge.extract(input.tabId, input.sourceType)
        store.save(leads)
        return json(leads)
      }
      if (request.method === "POST" && url.pathname === "/navigate") {
        const input = NavigateRequestSchema.parse(await request.json())
        return json(await bridge.navigate(input.tabId, input.url))
      }
      if (request.method === "POST" && url.pathname === "/scroll") {
        const input = ScrollRequestSchema.parse(await request.json())
        await bridge.scroll(input.tabId, input.amount)
        return json({ scrolled: input.amount })
      }
      if (request.method === "GET" && url.pathname === "/leads")
        return json(store.list())
      if (request.method === "GET" && url.pathname === "/records")
        return json(store.listRecords())
      const recordMatch = url.pathname.match(
        /^\/records\/([^/]+)\/qualification$/,
      )
      if (request.method === "PATCH" && recordMatch !== null) {
        const idPart = recordMatch[1]
        if (idPart === undefined) return json({ error: "Not found" }, 404)
        const id = decodeURIComponent(idPart)
        const input = QualificationRequestSchema.parse(await request.json())
        if (!store.updateQualification(id, input.qualificationStatus))
          return json({ error: "Lead not found" }, 404)
        const record = store
          .listRecords()
          .find((candidate) => candidate.lead.id === id)
        return record === undefined
          ? json({ error: "Lead not found" }, 404)
          : json(record)
      }
      return json({ error: "Not found" }, 404)
    },
    error(error) {
      if (error instanceof BridgeUnavailableError)
        return json({ error: error.message }, 503)
      if (error instanceof z.ZodError)
        return json({ error: "Invalid request", issues: error.issues }, 400)
      if (error instanceof SyntaxError)
        return json({ error: "Invalid JSON request" }, 400)
      return json(
        {
          error:
            error instanceof Error ? error.message : "Internal server error",
        },
        500,
      )
    },
    websocket: {
      message(socket, rawMessage) {
        if (String(rawMessage).length > 2_000_000) {
          socket.close(1009, "Message too large")
          return
        }
        let message: z.infer<typeof ExtensionMessageSchema>
        try {
          message = ExtensionMessageSchema.parse(JSON.parse(String(rawMessage)))
        } catch (error) {
          socket.send(
            JSON.stringify({
              type: "error",
              message:
                error instanceof Error ? error.message : "Invalid message",
            }),
          )
          return
        }

        if (message.type === "hello") {
          if (message.token !== config.token) {
            socket.close(1008, "Invalid pairing token")
            return
          }
          if (socket.data.authenticated) {
            socket.send(JSON.stringify({ type: "hello_ack", version: "0.1.0" }))
            return
          }
          if (!bridge.attach(socket)) {
            socket.close(1008, "Another extension is already connected")
            return
          }
          socket.data.authenticated = true
          socket.send(JSON.stringify({ type: "hello_ack", version: "0.1.0" }))
          return
        }
        if (!socket.data.authenticated) {
          socket.close(1008, "Authenticate first")
          return
        }
        bridge.settle(socket, message)
      },
      close(socket) {
        bridge.detach(socket)
      },
    },
  })
  actualPort = server.port ?? config.port

  return {
    port: server.port ?? config.port,
    bridge,
    stop() {
      server.stop(true)
      store.close()
    },
  }
}
