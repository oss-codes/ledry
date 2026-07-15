/** @jsxImportSource react */
import type { LeadRecord, Tab } from "../src/schemas"
import { LeadDetail } from "./lead-detail"
import { LeadList } from "./lead-list"
import {
  Button,
  EmptyState,
  Panel,
  SkeletonRows,
  StatusControl,
  Toast,
} from "./primitives"
import { SourceRail } from "./source-rail"

const tabs = [
  {
    id: 7,
    title: "Independent coffee roasters in Pune",
    url: "https://www.google.com/maps/search/coffee+roasters+pune",
  },
  {
    id: 11,
    title: "Studio North",
    url: "https://studio-north.example/contact",
  },
] satisfies readonly Tab[]

const record = {
  qualificationStatus: "qualified",
  lead: {
    id: "showcase_lead",
    name: "Katha Coffee Works",
    organization: "Katha Coffee Works",
    category: "Coffee roaster",
    website: "https://katha.example",
    emails: ["hello@katha.example"],
    phones: ["+91 20 5550 1842"],
    socialProfiles: [],
    address: "Baner, Pune",
    sourceUrl: "https://www.google.com/maps/place/katha",
    sourceType: "demo",
    capturedAt: "2026-07-13T08:30:00.000Z",
    evidence: [
      {
        field: "email",
        value: "hello@katha.example",
        sourceUrl: "https://katha.example/contact",
      },
    ],
    confidence: 0.87,
    score: 82,
    tags: ["pune", "coffee"],
  },
} satisfies LeadRecord

const internationalRecord = {
  qualificationStatus: "found",
  lead: {
    ...record.lead,
    id: "showcase_international",
    name: "東京コーヒー研究所",
    organization: "渋谷区の独立系ロースター",
    address: "東京都渋谷区神南一丁目",
    website: "https://tokyo-coffee.example",
    emails: ["hello@tokyo-coffee.example"],
  },
} satisfies LeadRecord

export function Showcase() {
  return (
    <main className="showcase">
      <header className="topbar">
        <div>
          <span className="brand">LEDRY</span>
          <h1>Primitive state showcase</h1>
        </div>
        <a className="button button-ghost" href="/">
          Return to dashboard
        </a>
      </header>
      <div className="showcase-grid">
        <Panel title="Buttons and status">
          <div className="showcase-stack">
            <div className="showcase-row">
              <Button kind="primary">Primary action</Button>
              <Button>Secondary</Button>
              <Button kind="ghost">Ghost</Button>
              <Button disabled>Disabled</Button>
              <Button disabled kind="primary">
                Saving...
              </Button>
            </div>
            <StatusControl
              label="Found example"
              value="found"
              onChange={() => undefined}
            />
            <StatusControl
              label="Qualified example"
              value="qualified"
              onChange={() => undefined}
            />
            <StatusControl
              label="Not qualified example"
              value="not-qualified"
              onChange={() => undefined}
            />
            <StatusControl
              label="Disabled example"
              disabled
              value="found"
              onChange={() => undefined}
            />
          </div>
        </Panel>
        <Panel title="Loading and empty states">
          <SkeletonRows />
          <EmptyState>
            <strong>No leads in this view</strong>
            <span>Change a filter or approve a source tab.</span>
          </EmptyState>
        </Panel>
        <SourceRail
          connected
          extracting
          onExtract={() => undefined}
          onSelect={() => undefined}
          selectedTabId={7}
          tabs={tabs}
        />
        <LeadList
          records={[record, internationalRecord]}
          selectedId={record.lead.id}
          onQualify={() => undefined}
          onSelect={() => undefined}
          savingId={internationalRecord.lead.id}
        />
        <LeadDetail
          record={record}
          saving={false}
          onQualify={() => undefined}
        />
        <Panel title="Feedback states">
          <div className="showcase-stack">
            <Toast kind="success" message="Qualification saved." />
            <Toast kind="neutral" message="Workspace refreshed." />
            <Toast kind="error" message="Extension connection failed." />
          </div>
        </Panel>
        <LeadDetail
          record={internationalRecord}
          saving
          onQualify={() => undefined}
        />
      </div>
    </main>
  )
}
