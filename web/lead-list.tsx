/** @jsxImportSource react */
import type { LeadRecord, QualificationStatus } from "../src/schemas"
import { EmptyState, Panel, StatusControl } from "./primitives"

export function LeadList({
  records,
  selectedId,
  onQualify,
  onSelect,
  savingId,
}: {
  readonly records: readonly LeadRecord[]
  readonly selectedId: string | undefined
  readonly onQualify: (id: string, status: QualificationStatus) => void
  readonly onSelect: (id: string) => void
  readonly savingId: string | undefined
}) {
  return (
    <Panel title={`Leads (${records.length})`} className="lead-list-panel">
      {records.length === 0 ? (
        <EmptyState>
          <strong>No leads in this view</strong>
          <span>Approve a source tab or change the current filters.</span>
        </EmptyState>
      ) : (
        <ul className="lead-list">
          {records.map(({ lead, qualificationStatus }) => (
            <li
              className={`lead-row ${selectedId === lead.id ? "is-selected" : ""}`}
              key={lead.id}
            >
              <button
                aria-pressed={selectedId === lead.id}
                className="lead-select"
                onClick={() => onSelect(lead.id)}
                type="button"
              >
                <span className="lead-primary">
                  <strong>{lead.name}</strong>
                  <span>
                    {lead.organization || lead.category || "Uncategorized"}
                  </span>
                </span>
                <span className="lead-meta">
                  <span>{lead.sourceType}</span>
                  <span className="mono">
                    {Math.round(lead.confidence * 100)}%
                  </span>
                  <span className="mono">{lead.score}/100</span>
                </span>
              </button>
              <StatusControl
                disabled={savingId === lead.id}
                onChange={(status) => onQualify(lead.id, status)}
                value={qualificationStatus}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
