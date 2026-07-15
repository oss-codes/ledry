import { describe, expect, test } from "bun:test"
import { configureActionPopup } from "../extension/action-behavior"

type ExtensionManifest = {
  readonly permissions?: readonly string[]
  readonly action?: {
    readonly default_popup?: string
  }
}

describe("extension tab approval entry point", () => {
  test("the toolbar opens a picker that can enumerate browser tabs", async () => {
    const manifest = (await Bun.file(
      new URL("../extension/manifest.json", import.meta.url),
    ).json()) as ExtensionManifest

    expect(manifest.permissions).toContain("tabs")
    expect(manifest.action?.default_popup).toBe("popup.html")
  })

  test("migrates upgrades away from the old action-to-side-panel preference", async () => {
    const writes: { openPanelOnActionClick: boolean }[] = []
    await configureActionPopup({
      async setPanelBehavior(options) {
        writes.push(options)
      },
    })

    expect(writes).toEqual([{ openPanelOnActionClick: false }])
  })
})
