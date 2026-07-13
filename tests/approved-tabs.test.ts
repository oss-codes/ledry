import { afterEach, describe, expect, test } from "bun:test"
import { navigateApprovedTab } from "../extension/approved-tabs"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "chrome")
})

describe("approved tab navigation", () => {
  test("rejects a cross-origin transition before Chrome navigates", async () => {
    const updates: unknown[] = []
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        storage: {
          session: {
            get: async () => ({
              approvedTabs: [{ id: 7, origin: "https://example.com" }],
            }),
          },
        },
        tabs: {
          get: async () => ({
            id: 7,
            status: "complete",
            url: "https://example.com/start",
          }),
          update: async (...args: unknown[]) => updates.push(args),
        },
        scripting: { executeScript: async () => [] },
      },
    })

    await expect(
      navigateApprovedTab(7, "https://other.example/results"),
    ).rejects.toThrow(
      "Cross-origin navigation requires the user to approve the destination tab",
    )
    expect(updates).toEqual([])
  })

  test("revokes approval when a same-origin URL redirects elsewhere", async () => {
    const stored: unknown[] = []
    const injections: unknown[] = []
    let getCount = 0
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        action: { setBadgeText: async () => undefined },
        storage: {
          session: {
            get: async () => ({
              approvedTabs: [{ id: 7, origin: "https://example.com" }],
            }),
            set: async (value: unknown) => stored.push(value),
          },
        },
        tabs: {
          get: async () => {
            getCount += 1
            return getCount < 3
              ? {
                  id: 7,
                  status: "complete",
                  url: "https://example.com/start",
                }
              : {
                  id: 7,
                  status: "complete",
                  url: "https://other.example/landing",
                }
          },
          update: async () => undefined,
        },
        scripting: {
          executeScript: async (value: unknown) => injections.push(value),
        },
      },
    })

    await expect(
      navigateApprovedTab(7, "https://example.com/redirect"),
    ).rejects.toThrow(
      "Navigation left the approved origin; approve the destination tab before continuing",
    )
    expect(stored).toEqual([{ approvedTabs: [] }])
    expect(injections).toEqual([
      { target: { tabId: 7 }, files: ["dist/content-script.js"] },
    ])
  })
})
