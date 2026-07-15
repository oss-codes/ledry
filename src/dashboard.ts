import { z } from "zod"
import dashboardStyles from "../web/dist/dashboard.css" with { type: "text" }
import dashboardScript from "../web/dist/dashboard.js" with { type: "text" }
import type { BrowserBridge } from "./bridge"
import { serializeLeadRecords } from "./export"
import { QualificationStatusSchema, RequestedSourceSchema } from "./schemas"
import type { LeadStore } from "./store"

const ExtractRequestSchema = z.object({
  tabId: z.number().int().nonnegative(),
  sourceType: RequestedSourceSchema.default("auto"),
  brief: z.string().trim().max(2_000).default(""),
  limit: z.number().int().min(1).max(25).default(5),
})
const QualificationRequestSchema = z.object({
  qualificationStatus: QualificationStatusSchema,
})
const ExportFormatSchema = z.enum(["csv", "json", "jsonl"])
const SESSION_COOKIE = "ledry_session"
const compressedScript = Bun.gzipSync(new TextEncoder().encode(dashboardScript))
const compressedStyles = Bun.gzipSync(new TextEncoder().encode(dashboardStyles))

const document = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Local lead review and qualification workspace">
    <title>Ledry Workspace</title>
    <link rel="stylesheet" href="/dashboard.css">
    <script type="module" src="/dashboard.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`

type DashboardContext = {
  readonly bridge: BrowserBridge
  readonly expectedOrigin: string
  readonly sessionToken: string
  readonly store: LeadStore
  readonly token: string
}

function secureHeaders(contentType: string): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  }
}

function hasSession(request: Request, sessionToken: string): boolean {
  const cookie = request.headers.get("Cookie")
  if (cookie === null) return false
  return cookie
    .split(";")
    .map((part) => part.trim())
    .includes(`${SESSION_COOKIE}=${sessionToken}`)
}

function hasBearer(request: Request, token: string): boolean {
  return request.headers.get("Authorization") === `Bearer ${token}`
}

function responseJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: secureHeaders("application/json; charset=utf-8"),
  })
}

function assetResponse(
  request: Request,
  source: string,
  compressed: Uint8Array,
  contentType: string,
): Response {
  const headers = new Headers(secureHeaders(contentType))
  headers.set("Vary", "Accept-Encoding")
  if (request.headers.get("Accept-Encoding")?.includes("gzip") === true) {
    headers.set("Content-Encoding", "gzip")
    return new Response(Uint8Array.from(compressed).buffer, { headers })
  }
  return new Response(source, { headers })
}

export async function handleDashboardRequest(
  request: Request,
  context: DashboardContext,
): Promise<Response | undefined> {
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === "/") {
    const headers = new Headers(secureHeaders("text/html; charset=utf-8"))
    headers.set(
      "Set-Cookie",
      `${SESSION_COOKIE}=${context.sessionToken}; HttpOnly; SameSite=Strict; Path=/`,
    )
    return new Response(document, { headers })
  }
  if (request.method === "GET" && url.pathname === "/dashboard.js")
    return assetResponse(
      request,
      dashboardScript,
      compressedScript,
      "text/javascript; charset=utf-8",
    )
  if (request.method === "GET" && url.pathname === "/dashboard.css")
    return assetResponse(
      request,
      dashboardStyles,
      compressedStyles,
      "text/css; charset=utf-8",
    )
  if (request.method === "GET" && url.pathname === "/favicon.ico")
    return new Response(null, { status: 204 })
  if (!url.pathname.startsWith("/api/")) return undefined

  const bearer = hasBearer(request, context.token)
  if (!bearer && !hasSession(request, context.sessionToken))
    return responseJson({ error: "Unauthorized" }, 401)
  if (
    request.method !== "GET" &&
    !bearer &&
    request.headers.get("Origin") !== context.expectedOrigin
  )
    return responseJson({ error: "Same-origin request required" }, 403)
  if (Number(request.headers.get("Content-Length") ?? "0") > 65_536)
    return responseJson({ error: "Request too large" }, 413)

  if (request.method === "GET" && url.pathname === "/api/dashboard") {
    const tabs = context.bridge.connected ? await context.bridge.tabs() : []
    return responseJson({
      health: {
        status: "ok",
        extensionConnected: context.bridge.connected,
        version: "0.1.0",
      },
      tabs,
      records: context.store.listRecords(),
      runs: context.store.listRuns(),
    })
  }
  if (request.method === "POST" && url.pathname === "/api/extract") {
    const input = ExtractRequestSchema.parse(await request.json())
    const leads = await context.bridge.extract(input.tabId, input.sourceType)
    const run = context.store.captureRun({
      brief: input.brief,
      leads,
      limit: input.limit,
      requestedSource: input.sourceType,
      tabId: input.tabId,
    })
    return responseJson({ run, records: context.store.listRecords(run.id) })
  }
  const match = url.pathname.match(/^\/api\/records\/([^/]+)\/qualification$/)
  if (request.method === "PATCH" && match !== null) {
    const idPart = match[1]
    if (idPart === undefined) return responseJson({ error: "Not found" }, 404)
    const id = decodeURIComponent(idPart)
    const input = QualificationRequestSchema.parse(await request.json())
    if (!context.store.updateQualification(id, input.qualificationStatus))
      return responseJson({ error: "Lead not found" }, 404)
    const record = context.store
      .listRecords()
      .find((candidate) => candidate.lead.id === id)
    return record === undefined
      ? responseJson({ error: "Lead not found" }, 404)
      : responseJson(record)
  }
  if (request.method === "GET" && url.pathname === "/api/export") {
    const format = ExportFormatSchema.parse(url.searchParams.get("format"))
    const runId = url.searchParams.get("run") ?? undefined
    const records = context.store.listRecords(runId)
    const output = serializeLeadRecords(
      runId === undefined
        ? records.filter(
            (record) => record.qualificationStatus !== "not-qualified",
          )
        : records,
      format,
    )
    const contentType = format === "csv" ? "text/csv" : "application/json"
    const headers = new Headers(secureHeaders(`${contentType}; charset=utf-8`))
    headers.set(
      "Content-Disposition",
      `attachment; filename="ledry-records.${format}"`,
    )
    return new Response(output, { headers })
  }
  return responseJson({ error: "Not found" }, 404)
}
