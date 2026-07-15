/** @jsxImportSource react */
import type { LeadRecord, QualificationStatus } from "../src/schemas"
import { EmptyState, Panel, StatusControl } from "./primitives"

function DetailField({
  label,
  machineReadable = false,
  value,
}: {
  readonly label: string
  readonly machineReadable?: boolean
  readonly value: string
}) {
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd className={machineReadable ? "detail-value-machine" : ""}>
        {value || "Not found"}
      </dd>
    </div>
  )
}

export function LeadDetail({
  record,
  saving,
  onQualify,
}: {
  readonly record: LeadRecord | undefined
  readonly saving: boolean
  readonly onQualify: (status: QualificationStatus) => void
}) {
  return (
    <Panel title="Lead detail" className="detail-panel">
      {record === undefined ? (
        <EmptyState>
          <strong>Select a lead</strong>
          <span>Evidence and contact details will appear here.</span>
        </EmptyState>
      ) : (
        <div className="detail-content">
          <div className="detail-heading">
            <div>
              <h3>{record.lead.name}</h3>
              <p>{record.lead.organization || record.lead.category}</p>
            </div>
            <span className="score mono">{record.lead.score}/100</span>
          </div>
          <StatusControl
            label={`Qualification for ${record.lead.name} in lead detail`}
            disabled={saving}
            onChange={onQualify}
            value={record.qualificationStatus}
          />
          <dl>
            <DetailField
              label="Website"
              machineReadable
              value={record.lead.website}
            />
            <DetailField
              label="Email"
              machineReadable
              value={record.lead.emails.join(", ")}
            />
            <DetailField label="Phone" value={record.lead.phones.join(", ")} />
            <DetailField label="Address" value={record.lead.address} />
            <DetailField
              label="Source"
              machineReadable
              value={record.lead.sourceUrl}
            />
          </dl>
          <div className="evidence">
            <h3>Evidence ({record.lead.evidence.length})</h3>
            {record.lead.evidence.length === 0 ? (
              <p className="muted">No field-level evidence was captured.</p>
            ) : (
              record.lead.evidence.map((item) => (
                <div
                  className="evidence-item"
                  key={`${item.field}-${item.value}`}
                >
                  <span>{item.field}</span>
                  <strong>{item.value}</strong>
                  <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                    View evidence source
                  </a>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
