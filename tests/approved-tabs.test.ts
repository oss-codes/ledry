import { afterEach, describe, expect, test } from "bun:test"
import {
  approveTab,
  assertApprovedTab,
  listApprovedTabs,
  navigateApprovedTab,
} from "../extension/approved-tabs"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "chrome")
})

describe("approved tab navigation", () => {
  test("refuses to approve an ambiguous personal social page", async () => {
    const stored: unknown[] = []
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        action: {
          setBadgeBackgroundColor: async () => undefined,
          setBadgeText: async () => undefined,
        },
        storage: {
          session: {
            get: async () => ({ approvedTabs: [] }),
            set: async (value: unknown) => stored.push(value),
          },
        },
        tabs: {
          get: async () => ({
            id: 7,
            url: "https://www.instagram.com/private-person/",
          }),
          sendMessage: async () => ({
            publicBusiness: false,
            sourceType: "social",
          }),
        },
        scripting: { executeScript: async () => [] },
      },
    })

    await expect(
      approveTab({
        id: 7,
        url: "https://www.instagram.com/private-person/",
      }),
    ).rejects.toThrow("explicit public business-page evidence")
    expect(stored).toEqual([])
  })

  test("remembers a social page only after business classification", async () => {
    const stored: unknown[] = []
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        action: {
          setBadgeBackgroundColor: async () => undefined,
          setBadgeText: async () => undefined,
        },
        storage: {
          session: {
            get: async () => ({ approvedTabs: [] }),
            set: async (value: unknown) => stored.push(value),
          },
        },
        tabs: {
          get: async () => ({
            id: 7,
            url: "https://www.instagram.com/northstarcoffee/",
          }),
          sendMessage: async () => ({
            publicBusiness: true,
            sourceType: "social",
          }),
        },
        scripting: { executeScript: async () => [] },
      },
    })

    await approveTab({
      id: 7,
      url: "https://www.instagram.com/northstarcoffee/",
    })

    expect(stored).toEqual([
      {
        approvedTabs: [
          {
            id: 7,
            origin: "https://www.instagram.com",
            url: "https://www.instagram.com/northstarcoffee/",
          },
        ],
      },
    ])
  })

  test("rejects a cross-origin transition before Chrome navigates", async () => {
    const updates: unknown[] = []
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        storage: {
          session: {
            get: async () => ({
              approvedTabs: [
                {
                  id: 7,
                  origin: "https://example.com",
                  url: "https://example.com/about",
                },
              ],
            }),
            set: async () => undefined,
          },
        },
        tabs: {
          get: async () => ({
            id: 7,
            status: "complete",
            url: "https://example.com/about",
          }),
          sendMessage: async () => ({ publicBusiness: true }),
          update: async (...args: unknown[]) => updates.push(args),
        },
        scripting: { executeScript: async () => [] },
      },
    })

    await expect(
      navigateApprovedTab(7, "https://other.example/contact"),
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
              approvedTabs: [
                {
                  id: 7,
                  origin: "https://example.com",
                  url: "https://example.com/about",
                },
              ],
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
                  url: "https://example.com/about",
                }
              : {
                  id: 7,
                  status: "complete",
                  url: "https://other.example/landing",
                }
          },
          sendMessage: async () => ({ publicBusiness: true }),
          update: async () => undefined,
        },
        scripting: {
          executeScript: async (value: unknown) => injections.push(value),
        },
      },
    })

    await expect(
      navigateApprovedTab(7, "https://example.com/contact"),
    ).rejects.toThrow(
      "Navigation left the approved origin; approve the destination tab before continuing",
    )
    expect(stored).toEqual([{ approvedTabs: [] }])
    expect(injections).toEqual([
      { target: { tabId: 7 }, files: ["dist/content-script.js"] },
    ])
  })

  test("revokes approval after same-origin navigation to a personal page", async () => {
    const stored: unknown[] = []
    let getCount = 0
    let classificationCount = 0
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        action: { setBadgeText: async () => undefined },
        storage: {
          session: {
            get: async () => ({
              approvedTabs: [
                {
                  id: 7,
                  origin: "https://www.instagram.com",
                  url: "https://www.instagram.com/northstarcoffee/",
                },
              ],
            }),
            set: async (value: unknown) => stored.push(value),
          },
        },
        tabs: {
          get: async () => {
            getCount += 1
            return {
              id: 7,
              status: "complete",
              url:
                getCount < 3
                  ? "https://www.instagram.com/northstarcoffee/"
                  : "https://www.instagram.com/private-person/",
            }
          },
          sendMessage: async () => {
            classificationCount += 1
            return { publicBusiness: classificationCount === 1 }
          },
          update: async () => undefined,
        },
        scripting: { executeScript: async () => [] },
      },
    })

    await expect(
      navigateApprovedTab(7, "https://www.instagram.com/private-person/"),
    ).rejects.toThrow("explicit public business-page evidence")
    expect(stored).toEqual([{ approvedTabs: [] }])
  })

  test("excludes and revokes a manually navigated personal page from tab listings", async () => {
    const stored: unknown[] = []
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        action: { setBadgeText: async () => undefined },
        storage: {
          session: {
            get: async () => ({
              approvedTabs: [
                {
                  id: 7,
                  origin: "https://www.instagram.com",
                  url: "https://www.instagram.com/northstarcoffee/",
                },
              ],
            }),
            set: async (value: unknown) => stored.push(value),
          },
        },
        tabs: {
          get: async () => ({
            id: 7,
            status: "complete",
            title: "Private Person",
            url: "https://www.instagram.com/private-person/",
          }),
          query: async () => [
            {
              id: 7,
              title: "Private Person",
              url: "https://www.instagram.com/private-person/",
            },
          ],
          sendMessage: async () => ({ publicBusiness: false }),
        },
        scripting: { executeScript: async () => [] },
      },
    })

    expect(await listApprovedTabs()).toEqual([])
    expect(stored).toEqual([{ approvedTabs: [] }])
  })

  test("marks and prioritizes the tab explicitly selected in the picker", async () => {
    const browserTabs = [
      {
        id: 4,
        title: "Other site",
        url: "https://example.com/about",
      },
      {
        id: 7,
        title: "Coaching classes",
        url: "https://www.google.com/maps/search/coaching+classes",
      },
    ]
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        storage: {
          session: {
            get: async () => ({
              approvedTabs: browserTabs.map((tab) => ({
                id: tab.id,
                origin: new URL(tab.url).origin,
                url: tab.url,
              })),
              selectedResearchTabId: 7,
            }),
          },
        },
        tabs: {
          get: async (tabId: number) =>
            browserTabs.find((tab) => tab.id === tabId),
          query: async () => browserTabs,
          sendMessage: async () => ({ publicBusiness: true }),
        },
        scripting: { executeScript: async () => [] },
      },
    })

    expect(await listApprovedTabs()).toEqual([
      {
        id: 7,
        selected: true,
        title: "Coaching classes",
        url: "https://www.google.com/maps/search/coaching+classes",
      },
      {
        id: 4,
        selected: false,
        title: "Other site",
        url: "https://example.com/about",
      },
    ])
  })

  test("revokes an unchanged URL when its live page becomes private", async () => {
    const stored: unknown[] = []
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        action: { setBadgeText: async () => undefined },
        storage: {
          session: {
            get: async () => ({
              approvedTabs: [
                {
                  id: 7,
                  origin: "https://example.com",
                  url: "https://example.com/about",
                },
              ],
            }),
            set: async (value: unknown) => stored.push(value),
          },
        },
        tabs: {
          get: async () => ({ id: 7, url: "https://example.com/about" }),
          sendMessage: async () => ({ publicBusiness: false }),
        },
        scripting: { executeScript: async () => [] },
      },
    })

    await expect(assertApprovedTab(7)).rejects.toThrow(
      "explicit public business-page evidence",
    )
    expect(stored).toEqual([{ approvedTabs: [] }])
  })
})
