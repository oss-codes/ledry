import "./opentui-env"
import { createCliRenderer } from "@opentui/core"
import {
  createRoot,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { DaemonClient, type Health } from "./client"
import type { AppConfig } from "./config"
import type { LeadRecord, ResearchResult, Tab } from "./schemas"
import type { BridgeServer } from "./server"
import { type DashboardLayout, DashboardView } from "./tui-view"

const COMPACT_WIDTH = 72
const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "youtube.com",
  "linkedin.com",
] as const
const GOOGLE_SUFFIX = /^(?:com|cat|[a-z]{2}|(?:co|com)\.[a-z]{2})$/

type SourceType = "google-maps" | "google-search" | "social" | "website"

export interface DashboardClient {
  health(): Promise<Health>
  tabs(): Promise<readonly Tab[]>
  research(input: {
    readonly brief: string
    readonly limit: number
    readonly sourceType: SourceType
    readonly tabId: number
  }): Promise<ResearchResult>
  records(): Promise<readonly LeadRecord[]>
}

type DashboardProps = {
  readonly client: DashboardClient
}

export function dashboardLayout(width: number): DashboardLayout {
  return width < COMPACT_WIDTH
    ? { direction: "column", tabWidth: "100%" }
    : { direction: "row", tabWidth: "40%" }
}

export function sourceTypeForUrl(value: string): SourceType {
  const url = new URL(value)
  const hostname = url.hostname.replace(/^www\./, "")
  const labels = hostname.split(".")
  const googleLabel = labels.lastIndexOf("google")
  const googleHost =
    googleLabel >= 0 &&
    GOOGLE_SUFFIX.test(labels.slice(googleLabel + 1).join("."))
  if (googleHost)
    return url.pathname.startsWith("/maps") ? "google-maps" : "google-search"
  return SOCIAL_HOSTS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  )
    ? "social"
    : "website"
}

export function Dashboard({ client }: DashboardProps) {
  const renderer = useRenderer()
  const { height, width } = useTerminalDimensions()
  const [health, setHealth] = useState<Health>({
    status: "ok",
    extensionConnected: false,
    version: "0.1.0",
  })
  const [tabs, setTabs] = useState<readonly Tab[]>([])
  const [records, setRecords] = useState<readonly LeadRecord[]>([])
  const [selectedTab, setSelectedTab] = useState(0)
  const [extracting, setExtracting] = useState(false)
  const [message, setMessage] = useState("Waiting for browser extension")
  const connected = useRef<boolean | undefined>(undefined)
  const extractionActive = useRef(false)
  const refreshing = useRef(false)

  const refresh = useCallback(
    async (announce: boolean) => {
      if (refreshing.current) return
      refreshing.current = true
      try {
        const currentHealth = await client.health()
        const [currentRecords, currentTabs] = await Promise.all([
          client.records(),
          currentHealth.extensionConnected
            ? client.tabs()
            : Promise.resolve([]),
        ])
        setHealth(currentHealth)
        setRecords(currentRecords)
        setTabs(currentTabs)
        setSelectedTab((current) =>
          currentTabs.length === 0
            ? 0
            : Math.min(current, currentTabs.length - 1),
        )
        if (announce) setMessage("Dashboard refreshed.")
        else if (connected.current !== currentHealth.extensionConnected)
          setMessage(
            currentHealth.extensionConnected
              ? "Connected. Select a tab and press s to extract."
              : "Waiting for browser extension",
          )
        connected.current = currentHealth.extensionConnected
      } catch (error) {
        setHealth({ status: "ok", extensionConnected: false, version: "0.1.0" })
        setTabs([])
        setMessage(error instanceof Error ? error.message : "Refresh failed")
      } finally {
        refreshing.current = false
      }
    },
    [client],
  )

  useEffect(() => {
    void refresh(false)
    const timer = setInterval(() => void refresh(false), 2_000)
    return () => clearInterval(timer)
  }, [refresh])

  useKeyboard((key) => {
    if (
      key.name === "q" ||
      key.name === "escape" ||
      (key.ctrl && key.name === "c")
    ) {
      renderer.destroy()
      return
    }
    if (key.name === "r") void refresh(true)
    if (
      tabs.length > 0 &&
      (key.name === "tab" || key.name === "down" || key.name === "up")
    ) {
      const direction = key.name === "up" || key.shift ? -1 : 1
      setSelectedTab(
        (current) => (current + direction + tabs.length) % tabs.length,
      )
    }
    if (key.name === "s" && !extractionActive.current) {
      const tab = tabs[selectedTab]
      if (tab === undefined) return
      extractionActive.current = true
      setExtracting(true)
      setMessage(`Extracting ${tab.title}…`)
      void client
        .research({
          brief: "Interactive OpenTUI capture",
          limit: 5,
          sourceType: sourceTypeForUrl(tab.url),
          tabId: tab.id,
        })
        .then((result) => {
          setMessage(
            `Run ${result.run.status}: ${result.run.saved} saved, ${result.run.quarantined} quarantined, ${result.run.skipped} skipped.`,
          )
          return refresh(false)
        })
        .catch((error: unknown) => {
          setMessage(
            error instanceof Error ? error.message : "Extraction failed",
          )
        })
        .finally(() => {
          extractionActive.current = false
          setExtracting(false)
        })
    }
  })

  const layout = dashboardLayout(width)
  return (
    <DashboardView
      compact={layout.direction === "column"}
      connected={health.extensionConnected}
      extracting={extracting}
      layout={layout}
      records={records}
      message={message}
      selectedTab={selectedTab}
      tabs={tabs}
      terminalHeight={height}
      terminalWidth={width}
    />
  )
}

export async function runTui(
  config: AppConfig,
  server: BridgeServer,
): Promise<void> {
  const done = Promise.withResolvers<void>()
  let stopped = false
  const stopServer = () => {
    if (!stopped) {
      stopped = true
      server.stop()
    }
  }
  let renderer: Awaited<ReturnType<typeof createCliRenderer>> | undefined
  let root: ReturnType<typeof createRoot> | undefined
  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: false,
      onDestroy: () => {
        stopServer()
        done.resolve()
      },
    })
    root = createRoot(renderer)
    root.render(<Dashboard client={new DaemonClient(config)} />)
    await done.promise
  } finally {
    root?.unmount()
    if (renderer !== undefined && !renderer.isDestroyed) renderer.destroy()
    stopServer()
  }
}
