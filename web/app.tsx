/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DashboardSnapshot, QualificationStatus } from "../src/schemas"
import { extractTab, fetchDashboard, updateQualification } from "./api"
import { LeadDetail } from "./lead-detail"
import { LeadList } from "./lead-list"
import { Metrics } from "./metrics"
import { Button, SkeletonRows, Toast } from "./primitives"
import { StatusFilterSchema } from "./schemas"
import { sourceTypeForUrl } from "./source"
import { SourceRail } from "./source-rail"

type StatusFilter = "all" | QualificationStatus
type Notice = {
  readonly kind: "error" | "neutral" | "success"
  readonly message: string
}

export function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>()
  const [selectedTabId, setSelectedTabId] = useState<number>()
  const [selectedLeadId, setSelectedLeadId] = useState<string>()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [extracting, setExtracting] = useState(false)
  const [savingId, setSavingId] = useState<string>()
  const [notice, setNotice] = useState<Notice>()
  const refreshing = useRef(false)

  const refresh = useCallback(async (announce = false) => {
    if (refreshing.current) return
    refreshing.current = true
    try {
      const current = await fetchDashboard()
      setSnapshot(current)
      setSelectedTabId((existing) =>
        current.tabs.some((tab) => tab.id === existing)
          ? existing
          : (current.tabs.find((tab) => tab.selected)?.id ??
            current.tabs[0]?.id),
      )
      setSelectedLeadId((existing) =>
        current.records.some((record) => record.lead.id === existing)
          ? existing
          : current.records[0]?.lead.id,
      )
      if (announce)
        setNotice({ kind: "neutral", message: "Workspace refreshed." })
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Refresh failed.",
      })
    } finally {
      refreshing.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (notice === undefined) return
    const timer = window.setTimeout(() => setNotice(undefined), 4_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (snapshot?.records ?? []).filter((record) => {
      const statusMatches =
        statusFilter === "all" || record.qualificationStatus === statusFilter
      const queryMatches =
        needle === "" ||
        [
          record.lead.name,
          record.lead.organization,
          record.lead.category,
          record.lead.website,
          record.lead.emails.join(" "),
        ].some((value) => value.toLowerCase().includes(needle))
      return statusMatches && queryMatches
    })
  }, [query, snapshot?.records, statusFilter])

  const selectedRecord =
    filteredRecords.find((record) => record.lead.id === selectedLeadId) ??
    filteredRecords[0]
  const selectedTab = snapshot?.tabs.find((tab) => tab.id === selectedTabId)
  const effectiveSelectedLeadId = selectedRecord?.lead.id
  const latestRun = snapshot?.runs[0]

  async function handleExtract(): Promise<void> {
    if (selectedTab === undefined) return
    setExtracting(true)
    try {
      const result = await extractTab(
        selectedTab.id,
        sourceTypeForUrl(selectedTab.url),
      )
      await refresh()
      setNotice({
        kind: "success",
        message: `Run complete: ${result.run.saved} saved, ${result.run.quarantined} quarantined, ${result.run.skipped} skipped.`,
      })
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Extraction failed.",
      })
    } finally {
      setExtracting(false)
    }
  }

  async function handleQualify(
    id: string,
    status: QualificationStatus,
  ): Promise<void> {
    setSavingId(id)
    try {
      const updated = await updateQualification(id, status)
      setSnapshot((current) =>
        current === undefined
          ? current
          : {
              ...current,
              records: current.records.map((record) =>
                record.lead.id === id ? updated : record,
              ),
            },
      )
      setNotice({
        kind: "success",
        message: `${updated.lead.name} marked ${status}.`,
      })
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Update failed.",
      })
    } finally {
      setSavingId(undefined)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand">LEDRY</span>
          <h1>Lead review workspace</h1>
        </div>
        <div className="top-actions">
          <a
            className="button button-ghost"
            href={`/api/export?format=csv${latestRun === undefined ? "" : `&run=${encodeURIComponent(latestRun.id)}`}`}
          >
            {latestRun === undefined
              ? "Export all CSV"
              : "Export latest run CSV"}
          </a>
          <Button onClick={() => void refresh(true)}>Refresh</Button>
        </div>
      </header>

      <Metrics snapshot={snapshot} />

      {latestRun === undefined ? null : (
        <section className="run-report" aria-label="Latest research run">
          <div>
            <span>Latest run</span>
            <strong>
              {latestRun.status === "completed"
                ? "Capture complete"
                : "No safe leads found"}
            </strong>
          </div>
          <dl>
            <div>
              <dt>Saved</dt>
              <dd>{latestRun.saved}</dd>
            </div>
            <div>
              <dt>Discovered</dt>
              <dd>{latestRun.discovered}</dd>
            </div>
            <div>
              <dt>Quarantined</dt>
              <dd>{latestRun.quarantined}</dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>{latestRun.skipped}</dd>
            </div>
          </dl>
          <small>
            {latestRun.warnings.join(" · ") ||
              "All captured records passed data-quality checks."}
          </small>
        </section>
      )}

      <div className="filters">
        <label>
          <span>Search leads</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, company, contact"
          />
        </label>
        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(StatusFilterSchema.parse(event.target.value))
            }
          >
            <option value="all">All statuses</option>
            <option value="found">Found</option>
            <option value="qualified">Qualified</option>
            <option value="not-qualified">Not qualified</option>
          </select>
        </label>
      </div>

      {notice === undefined ? null : (
        <Toast kind={notice.kind} message={notice.message} />
      )}

      {snapshot === undefined ? (
        <section className="loading-panel">
          <SkeletonRows />
        </section>
      ) : (
        <div className="workspace">
          <SourceRail
            connected={snapshot.health.extensionConnected}
            extracting={extracting}
            onExtract={() => void handleExtract()}
            onSelect={setSelectedTabId}
            selectedTabId={selectedTabId}
            tabs={snapshot.tabs}
          />
          <LeadList
            records={filteredRecords}
            selectedId={effectiveSelectedLeadId}
            onQualify={(id, status) => void handleQualify(id, status)}
            onSelect={setSelectedLeadId}
            savingId={savingId}
          />
          <LeadDetail
            record={selectedRecord}
            saving={savingId === selectedRecord?.lead.id}
            onQualify={(status) =>
              selectedRecord === undefined
                ? undefined
                : void handleQualify(selectedRecord.lead.id, status)
            }
          />
        </div>
      )}
    </main>
  )
}
