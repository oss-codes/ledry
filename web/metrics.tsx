/** @jsxImportSource react */
import type { DashboardSnapshot, QualificationStatus } from "../src/schemas"

export function Metrics({
  snapshot,
}: {
  readonly snapshot: DashboardSnapshot | undefined
}) {
  const records = snapshot?.records ?? []
  const counts = {
    total: records.length,
    found: records.filter((record) => record.qualificationStatus === "found")
      .length,
    qualified: records.filter(
      (record) => record.qualificationStatus === "qualified",
    ).length,
    notQualified: records.filter(
      (record) => record.qualificationStatus === "not-qualified",
    ).length,
  }
  return (
    <section className="metrics" aria-label="Lead totals">
      <Metric label="All leads" value={counts.total} />
      <Metric label="Found" value={counts.found} status="found" />
      <Metric label="Qualified" value={counts.qualified} status="qualified" />
      <Metric
        label="Not qualified"
        value={counts.notQualified}
        status="not-qualified"
      />
    </section>
  )
}

function Metric({
  label,
  status,
  value,
}: {
  readonly label: string
  readonly status?: QualificationStatus
  readonly value: number
}) {
  return (
    <div className={`metric ${status === undefined ? "" : `metric-${status}`}`}>
      <span>{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  )
}
