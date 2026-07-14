import { describe, expect, test } from "bun:test"
import { connectionConfigChanged } from "../extension/storage-policy"

describe("extension connection storage policy", () => {
  test("keeps the bridge open for side-panel notes", () => {
    expect(
      connectionConfigChanged(
        { currentBrief: { newValue: "Research" } },
        "local",
      ),
    ).toBeFalse()
  })

  test("reconnects only when pairing configuration changes", () => {
    expect(
      connectionConfigChanged({ token: { newValue: "masked" } }, "local"),
    ).toBeTrue()
    expect(
      connectionConfigChanged({ port: { newValue: 43_110 } }, "local"),
    ).toBeTrue()
    expect(connectionConfigChanged({ token: {} }, "sync")).toBeFalse()
  })
})
