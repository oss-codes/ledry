import stringWidth from "string-width"
import type { LeadRecord, Tab } from "./schemas"
import { truncateCells } from "./tui-text"

export type DashboardLayout = {
  readonly direction: "column" | "row"
  readonly tabWidth: "100%" | "40%"
}

export type DashboardViewProps = {
  readonly compact: boolean
  readonly connected: boolean
  readonly extracting: boolean
  readonly layout: DashboardLayout
  readonly records: readonly LeadRecord[]
  readonly message: string
  readonly selectedTab: number
  readonly tabs: readonly Tab[]
  readonly terminalHeight: number
  readonly terminalWidth: number
}

type VisibleRange = {
  readonly start: number
  readonly end: number
}

export function visibleTabRange(
  total: number,
  selected: number,
  limit: number,
): VisibleRange {
  const endLimit = Math.max(0, total - limit)
  const start = Math.min(
    Math.max(0, selected - Math.floor(limit / 2)),
    endLimit,
  )
  return { start, end: Math.min(total, start + limit) }
}

export function tabRowLimit(compact: boolean, terminalHeight: number): number {
  if (compact) {
    const mainHeight = Math.max(0, terminalHeight - 11)
    const panelHeight = Math.floor((mainHeight - 1) / 2)
    return Math.max(1, panelHeight - 3)
  }
  const mainHeight = Math.max(0, terminalHeight - 14)
  return Math.max(1, Math.min(10, mainHeight - 3))
}

export function DashboardView({
  compact,
  connected,
  extracting,
  layout,
  records,
  message,
  selectedTab,
  tabs,
  terminalHeight,
  terminalWidth,
}: DashboardViewProps) {
  const selected = tabs[selectedTab]
  const connectionColor = connected ? "#4ade80" : "#f59e0b"
  const tabLimit = tabRowLimit(compact, terminalHeight)
  const range = visibleTabRange(tabs.length, selectedTab, tabLimit)
  const visibleTabs = tabs.slice(range.start, range.end)
  const tabPaneWidth = compact
    ? terminalWidth - 2
    : Math.floor((terminalWidth - 2) * 0.4)
  const tabContentWidth = Math.max(1, tabPaneWidth - 4)
  const leadPaneWidth = compact
    ? terminalWidth - 2
    : terminalWidth - 3 - tabPaneWidth
  const leadContentWidth = Math.max(1, leadPaneWidth - 4)
  const footerContentWidth = Math.max(1, terminalWidth - 6)
  const controls =
    terminalWidth >= 56
      ? compact
        ? "[Tab/↑↓] select  [s] scrape  [r] refresh  [q] quit"
        : "[Tab/↑↓] select tab  [s] scrape  [r] refresh  [q] quit"
      : terminalWidth >= 40
        ? "[↑↓] select [s] scrape [r] refresh [q] quit"
        : "[↑↓] [s] [r] [q]"

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor="#07111f"
      padding={1}
      gap={1}
    >
      <box
        borderStyle="rounded"
        borderColor="#38bdf8"
        paddingX={1}
        flexDirection={compact ? "row" : "column"}
        height={compact ? 3 : 5}
        gap={compact ? 2 : 0}
      >
        <text fg="#7dd3fc" height={1}>
          <strong>LEDRY</strong>
          {compact ? null : (
            <span fg="#64748b"> local-first browser research</span>
          )}
        </text>
        <text fg={connectionColor} height={1}>
          ● {connected ? "Extension connected" : "Extension offline"}
        </text>
      </box>

      <box flexDirection={layout.direction} flexGrow={1} gap={1} minHeight={0}>
        <box
          width={layout.tabWidth}
          flexGrow={compact ? 1 : 0}
          borderStyle="rounded"
          borderColor="#334155"
          paddingX={1}
          flexDirection="column"
          minHeight={0}
        >
          <text fg="#a5b4fc" height={1}>
            <strong>
              Browser tabs
              {tabs.length === 0 ? "" : ` (${selectedTab + 1}/${tabs.length})`}
            </strong>
          </text>
          {tabs.length === 0 ? (
            <text fg="#64748b" height={1}>
              No approved tabs
            </text>
          ) : (
            visibleTabs.map((tab, offset) => {
              const index = range.start + offset
              return (
                <text
                  key={tab.id}
                  fg={index === selectedTab ? "#f8fafc" : "#64748b"}
                  height={1}
                >
                  {index === selectedTab ? "› " : "  "}
                  {truncateCells(tab.title, tabContentWidth - 2)}
                </text>
              )
            })
          )}
        </box>

        <box
          width={compact ? "100%" : "auto"}
          flexGrow={1}
          borderStyle="rounded"
          borderColor="#334155"
          paddingX={1}
          flexDirection="column"
          minHeight={0}
        >
          <text fg="#a5b4fc" height={1}>
            <strong>Captured leads ({records.length})</strong>
          </text>
          {records.length === 0 ? (
            <text fg="#64748b" height={1}>
              Extract a Google, Maps, website, or public social tab.
            </text>
          ) : (
            records.slice(0, compact ? 1 : 12).map((record) => {
              const { lead, qualificationStatus } = record
              const contact = lead.phones[0] ?? lead.emails[0] ?? lead.website
              const nameWidth = Math.min(
                compact ? 24 : 32,
                Math.floor(leadContentWidth * 0.55),
              )
              const name = truncateCells(lead.name, nameWidth)
              const contactWidth = Math.max(
                0,
                leadContentWidth -
                  stringWidth(name) -
                  stringWidth(qualificationStatus) -
                  2,
              )
              return (
                <text key={lead.id} fg="#cbd5e1" height={1}>
                  {name}
                  {contact === "" ? null : (
                    <span fg="#64748b">
                      {" "}
                      {truncateCells(contact, contactWidth)}
                    </span>
                  )}
                  <span
                    fg={
                      qualificationStatus === "qualified"
                        ? "#4ade80"
                        : qualificationStatus === "not-qualified"
                          ? "#fb7185"
                          : "#f59e0b"
                    }
                  >
                    {" "}
                    {qualificationStatus}
                  </span>
                </text>
              )
            })
          )}
        </box>
      </box>

      <box
        borderStyle="rounded"
        borderColor="#334155"
        paddingX={1}
        height={compact ? 4 : selected === undefined ? 4 : 5}
        flexDirection="column"
      >
        <text fg={extracting ? "#7dd3fc" : "#94a3b8"} height={1}>
          {truncateCells(message, footerContentWidth)}
        </text>
        {compact || selected === undefined ? null : (
          <text fg="#64748b" height={1}>
            {truncateCells(selected.url, footerContentWidth)}
          </text>
        )}
        <text fg="#64748b" height={1}>
          {truncateCells(controls, footerContentWidth)}
        </text>
      </box>
    </box>
  )
}
