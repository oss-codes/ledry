/** @jsxImportSource react */
import type { ReactNode } from "react"
import type { QualificationStatus } from "../src/schemas"

export function Button({
  children,
  disabled = false,
  kind = "secondary",
  onClick,
  type = "button",
}: {
  readonly children: ReactNode
  readonly disabled?: boolean
  readonly kind?: "primary" | "secondary" | "ghost"
  readonly onClick?: () => void
  readonly type?: "button" | "submit"
}) {
  return (
    <button
      className={`button button-${kind}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  )
}

export function Panel({
  action,
  children,
  className = "",
  title,
}: {
  readonly action?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  readonly title: string
}) {
  return (
    <section className={`panel ${className}`} aria-label={title}>
      <header className="panel-header">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

const STATUSES = [
  { value: "found", label: "Found" },
  { value: "qualified", label: "Qualified" },
  { value: "not-qualified", label: "Not qualified" },
] satisfies ReadonlyArray<{
  readonly value: QualificationStatus
  readonly label: string
}>

export function StatusControl({
  label,
  disabled = false,
  onChange,
  value,
}: {
  readonly label: string
  readonly disabled?: boolean
  readonly onChange: (status: QualificationStatus) => void
  readonly value: QualificationStatus
}) {
  return (
    <fieldset className="status-control" aria-busy={disabled}>
      <legend className="visually-hidden">{label}</legend>
      {STATUSES.map((status) => (
        <button
          aria-pressed={value === status.value}
          className={`status-choice status-${status.value}`}
          disabled={disabled}
          key={status.value}
          onClick={() => onChange(status.value)}
          type="button"
        >
          {status.label}
        </button>
      ))}
    </fieldset>
  )
}

export function EmptyState({ children }: { readonly children: ReactNode }) {
  return <div className="empty-state">{children}</div>
}

export function SkeletonRows() {
  return (
    <div className="skeleton-stack" role="status" aria-label="Loading leads">
      {["a", "b", "c", "d"].map((key) => (
        <div className="skeleton-row" key={key} />
      ))}
    </div>
  )
}

export function Toast({
  kind,
  message,
}: {
  readonly kind: "error" | "neutral" | "success"
  readonly message: string
}) {
  return (
    <div
      className={`toast toast-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  )
}
