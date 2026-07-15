import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import stringWidth from "string-width"
import type { Lead, LeadRecord, Tab } from "../src/schemas"
import {
  Dashboard,
  type DashboardClient,
  dashboardLayout,
  sourceTypeForUrl,
} from "../src/tui"
import { sanitizeTerminalText, truncateCells } from "../src/tui-text"
import { DashboardView, tabRowLimit, visibleTabRange } from "../src/tui-view"

const tabs: readonly Tab[] = [
  { id: 1, title: "Alpha Bakery", url: "https://example.com/alpha" },
  {
    id: 2,
    title: "Beta Studio",
    url: "https://www.instagram.com/beta-studio",
  },
]

const lead: Lead = {
  id: "lead-1",
  name: "Acme Coffee",
  organization: "Acme Coffee",
  category: "Cafe",
  website: "https://acme.example",
  emails: ["hello@acme.example"],
  phones: [],
  socialProfiles: [],
  address: "Main Street",
  sourceUrl: "https://acme.example",
  sourceType: "website",
  capturedAt: "2026-07-12T00:00:00.000Z",
  evidence: [],
  confidence: 0.9,
  score: 90,
  tags: [],
}
const record = { lead, qualificationStatus: "found" } satisfies LeadRecord

class FakeDashboardClient implements DashboardClient {
  readonly extractions: { readonly tabId: number; readonly source: string }[] =
    []

  async health() {
    return { status: "ok" as const, extensionConnected: true, version: "test" }
  }

  async tabs() {
    return tabs
  }

  async research(input: Parameters<DashboardClient["research"]>[0]) {
    const { sourceType: source, tabId } = input
    this.extractions.push({ tabId, source })
    return {
      run: {
        id: "run:tui",
        brief: input.brief,
        tabId,
        requestedSource: source,
        actualSources: [source],
        limit: input.limit,
        discovered: 1,
        saved: 1,
        quarantined: 0,
        skipped: 0,
        status: "completed" as const,
        warnings: [],
        startedAt: "2026-07-15T00:00:00.000Z",
        completedAt: "2026-07-15T00:00:01.000Z",
        recordIds: [lead.id],
      },
      records: [record],
    }
  }

  async records() {
    return [record]
  }
}

async function renderDashboard(width: number, height: number) {
  const client = new FakeDashboardClient()
  const setup = await testRender(<Dashboard client={client} />, {
    width,
    height,
  })
  await act(async () => {
    await Bun.sleep(0)
  })
  await setup.renderOnce()
  return { ...setup, client }
}

describe("OpenTUI dashboard", () => {
  test("stacks panels before a narrow terminal can collide", () => {
    expect(dashboardLayout(60)).toEqual({
      direction: "column",
      tabWidth: "100%",
    })
  })

  test("uses side-by-side panels when enough columns are available", () => {
    expect(dashboardLayout(100)).toEqual({
      direction: "row",
      tabWidth: "40%",
    })
  })

  test("keeps the selected tab inside the rendered window", () => {
    expect(visibleTabRange(12, 8, 2)).toEqual({ start: 7, end: 9 })
    expect(visibleTabRange(12, 11, 2)).toEqual({ start: 10, end: 12 })
    expect(tabRowLimit(false, 20)).toBe(3)
    expect(tabRowLimit(true, 20)).toBe(1)
  })

  test("truncates CJK and emoji by terminal cells without splitting graphemes", () => {
    expect(truncateCells("東京コーヒー☕️株式会社", 10)).toBe("東京コー…")
    expect(stringWidth(truncateCells("東京コーヒー☕️株式会社", 10))).toBe(9)
    expect(truncateCells("Cafe 👩🏽‍💻 Collective", 10)).toBe("Cafe 👩🏽‍💻 C…")
  })

  test("neutralizes terminal and bidi control sequences", () => {
    const hostile = "lead\u001b]52;c;clipboard\u0007\u202Etxt"
    const safe = sanitizeTerminalText(hostile)
    expect(safe).not.toContain("\u001b")
    expect(safe).not.toContain("\u0007")
    expect(safe).not.toContain("\u202E")
    expect(safe).toContain("�")
  })

  test("renders hostile page data without terminal control sequences", async () => {
    const setup = await testRender(
      <DashboardView
        compact={false}
        connected={true}
        extracting={false}
        layout={{ direction: "row", tabWidth: "40%" }}
        records={[
          {
            ...record,
            lead: {
              ...lead,
              name: "Lead\u0007Name",
              phones: ["123\u001b[2J456"],
            },
          },
        ]}
        message="Error\u001b[2J\u202Etxt"
        selectedTab={0}
        tabs={[
          {
            id: 9,
            title: "Page\u001b]52;c;clipboard\u0007",
            url: "https://example.com/\u202Espoof",
          },
        ]}
        terminalHeight={28}
        terminalWidth={100}
      />,
      { width: 100, height: 28 },
    )
    try {
      await setup.renderOnce()
      const frame = setup.captureCharFrame()
      expect(frame).not.toContain("\u001b")
      expect(frame).not.toContain("\u0007")
      expect(frame).not.toContain("\u202E")
      expect(frame).toContain("�")
    } finally {
      act(() => setup.renderer.destroy())
    }
  })

  test("renders readable stacked panels at 60 by 20", async () => {
    const { captureCharFrame, renderer } = await renderDashboard(60, 20)
    try {
      const frame = captureCharFrame()
      const lines = frame.split("\n")
      const tabsLine = lines.findIndex((line) => line.includes("Browser tabs"))
      const leadsLine = lines.findIndex((line) =>
        line.includes("Captured leads (1)"),
      )

      expect(frame).toContain("LEDRY")
      expect(frame).toContain("Extension connected")
      expect(tabsLine).toBeGreaterThan(-1)
      expect(leadsLine).toBeGreaterThan(tabsLine)
      expect(lines.every((line) => line.length <= 60)).toBe(true)
    } finally {
      act(() => renderer.destroy())
    }
  })

  test("renders wide panels side by side and drives keyboard extraction", async () => {
    const { captureCharFrame, client, mockInput, renderOnce, renderer } =
      await renderDashboard(100, 28)
    try {
      const initial = captureCharFrame()
      expect(
        initial
          .split("\n")
          .some(
            (line) =>
              line.includes("Browser tabs") &&
              line.includes("Captured leads (1)"),
          ),
      ).toBe(true)

      await act(async () => {
        mockInput.pressTab()
        await Bun.sleep(0)
      })
      await renderOnce()
      expect(captureCharFrame()).toContain("› Beta Studio")

      await act(async () => {
        mockInput.pressKey("s")
        mockInput.pressKey("s")
        await Bun.sleep(0)
      })
      await renderOnce()
      expect(captureCharFrame()).toContain("1 saved, 0 quarantined, 0 skipped")
      expect(client.extractions).toEqual([{ tabId: 2, source: "social" }])
    } finally {
      act(() => renderer.destroy())
    }
  })

  test("chooses explicit adapters for Google and public social URLs", () => {
    expect(sourceTypeForUrl("https://www.google.com/maps/search/cafes")).toBe(
      "google-maps",
    )
    expect(sourceTypeForUrl("https://www.google.com/search?q=cafes")).toBe(
      "google-search",
    )
    expect(sourceTypeForUrl("https://business.facebook.com/acme")).toBe(
      "social",
    )
    expect(sourceTypeForUrl("https://www.linkedin.com/company/acme")).toBe(
      "social",
    )
    expect(sourceTypeForUrl("https://acme.example/about")).toBe("website")
    expect(sourceTypeForUrl("https://notgoogle.com/maps")).toBe("website")
    expect(sourceTypeForUrl("https://google.example.com/maps")).toBe("website")
    expect(sourceTypeForUrl("https://evil.google.example.com/maps")).toBe(
      "website",
    )
    expect(sourceTypeForUrl("https://maps.google.co.uk/maps")).toBe(
      "google-maps",
    )
  })
})
