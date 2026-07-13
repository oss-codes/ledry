/** @jsxImportSource react */
import type { Tab } from "../src/schemas"
import { Button, EmptyState, Panel } from "./primitives"
import { sourceTypeForUrl } from "./source"

export function SourceRail({
  connected,
  extracting,
  onExtract,
  onSelect,
  selectedTabId,
  tabs,
}: {
  readonly connected: boolean
  readonly extracting: boolean
  readonly onExtract: () => void
  readonly onSelect: (id: number) => void
  readonly selectedTabId: number | undefined
  readonly tabs: readonly Tab[]
}) {
  return (
    <Panel
      title={`Browser tabs (${tabs.length})`}
      className="source-panel"
      action={
        <span className={`connection ${connected ? "connected" : "offline"}`}>
          {connected ? "Connected" : "Offline"}
        </span>
      }
    >
      {tabs.length === 0 ? (
        <EmptyState>
          <strong>
            {connected ? "No approved tabs" : "Extension offline"}
          </strong>
          <span>
            {connected
              ? "Open a source and approve it from the extension."
              : "Run ledry pair, then connect the Chrome extension."}
          </span>
        </EmptyState>
      ) : (
        <div className="source-list">
          {tabs.map((tab) => (
            <button
              aria-pressed={selectedTabId === tab.id}
              className={`source-row ${selectedTabId === tab.id ? "is-selected" : ""}`}
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              type="button"
            >
              <span className="source-type">{sourceTypeForUrl(tab.url)}</span>
              <strong>{tab.title}</strong>
              <span className="source-url mono">{tab.url}</span>
            </button>
          ))}
        </div>
      )}
      <div className="source-action">
        <Button
          disabled={selectedTabId === undefined || extracting}
          kind="primary"
          onClick={onExtract}
        >
          {extracting ? "Extracting..." : "Extract selected tab"}
        </Button>
      </div>
    </Panel>
  )
}
