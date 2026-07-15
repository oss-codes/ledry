import { describe, expect, test } from "bun:test"
import { canOpenPickerTab, createPickerState } from "../extension/popup-state"

describe("popup tab picker", () => {
  test("selects the active Maps tab and excludes privileged pages", () => {
    const state = createPickerState(
      [
        {
          id: 4,
          active: true,
          title: "coaching classes - Google Maps",
          url: "https://www.google.com/maps/search/coaching+classes",
        },
        {
          id: 5,
          active: false,
          title: "Extensions",
          url: "chrome://extensions",
        },
      ],
      [],
      null,
    )

    expect(state.selectedId).toBe(4)
    expect(state.tabs).toEqual([
      {
        id: 4,
        active: true,
        approved: false,
        origin: "https://www.google.com",
        source: "Google Maps",
        title: "coaching classes - Google Maps",
        url: "https://www.google.com/maps/search/coaching+classes",
      },
    ])
  })

  test("restores the explicitly selected approved tab", () => {
    const state = createPickerState(
      [
        {
          id: 4,
          active: true,
          title: "Search",
          url: "https://www.google.com/search?q=coaching+classes",
        },
        {
          id: 8,
          active: false,
          title: "Coaching company",
          url: "https://example.com/contact",
        },
      ],
      [{ id: 8, origin: "https://example.com" }],
      8,
    )

    expect(state.selectedId).toBe(8)
    expect(state.tabs.find((tab) => tab.id === 8)?.approved).toBeTrue()
  })

  test("uses strict source labels for Google domains and lookalikes", () => {
    const state = createPickerState(
      [
        {
          id: 1,
          active: true,
          title: "India search",
          url: "https://www.google.co.in/search?q=coaching",
        },
        {
          id: 2,
          active: false,
          title: "Lookalike",
          url: "https://evilgoogle.com/",
        },
        {
          id: 3,
          active: false,
          title: "Another lookalike",
          url: "https://notlinkedin.com/",
        },
      ],
      [],
      null,
    )

    expect(state.tabs.map((tab) => tab.source)).toEqual([
      "Google Search",
      "Public website",
      "Public website",
    ])
  })

  test("requires a restored selected tab to be active before opening", () => {
    const state = createPickerState(
      [
        {
          id: 8,
          active: false,
          title: "Background company",
          url: "https://example.com/about",
        },
      ],
      [{ id: 8, origin: "https://example.com" }],
      8,
    )

    expect(canOpenPickerTab(state.tabs[0], state.selectedId)).toBeFalse()
  })
})
