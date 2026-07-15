import { describe, expect, test } from "bun:test"
import {
  OriginPermissionError,
  type PermissionRequester,
  requestOriginPermission,
} from "../extension/sidepanel-permissions"

describe("side panel origin permission", () => {
  test("requests only the displayed public origin", async () => {
    const requests: chrome.permissions.Permissions[] = []
    const requester: PermissionRequester = {
      async request(permissions) {
        requests.push(permissions)
        return true
      },
    }

    await requestOriginPermission("https://www.google.com", requester)

    expect(requests).toEqual([{ origins: ["https://www.google.com/*"] }])
  })

  test("approves the origin of a public LinkedIn organization page", async () => {
    const requests: chrome.permissions.Permissions[] = []
    const requester: PermissionRequester = {
      async request(permissions) {
        requests.push(permissions)
        return true
      },
    }

    await requestOriginPermission(
      "https://www.linkedin.com/company/northstar/about/",
      requester,
    )

    expect(requests).toEqual([{ origins: ["https://www.linkedin.com/*"] }])
  })

  test("stops approval when Chrome denies access", async () => {
    const requester: PermissionRequester = {
      async request() {
        return false
      },
    }

    expect(
      requestOriginPermission("https://example.com", requester),
    ).rejects.toBeInstanceOf(OriginPermissionError)
  })

  test("never prompts for a blocked source", async () => {
    let requested = false
    const requester: PermissionRequester = {
      async request() {
        requested = true
        return true
      },
    }

    expect(
      requestOriginPermission("https://linkedin.com", requester),
    ).rejects.toBeInstanceOf(OriginPermissionError)
    expect(requested).toBeFalse()
  })
})
