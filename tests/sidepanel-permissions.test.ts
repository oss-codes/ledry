import { describe, expect, test } from "bun:test"
import {
  OriginPermissionError,
  type PermissionManager,
  type PermissionRequester,
  requestOriginPermission,
  withOriginPermission,
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

    await requestOriginPermission(
      "https://www.google.com/maps/search/plumbers",
      requester,
    )

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

  test("removes a newly granted origin when page approval fails", async () => {
    const removed: chrome.permissions.Permissions[] = []
    const manager: PermissionManager = {
      async contains() {
        return false
      },
      async request() {
        return true
      },
      async remove(permissions) {
        removed.push(permissions)
        return true
      },
    }

    await expect(
      withOriginPermission(
        "https://www.instagram.com/northstar/",
        async () => {
          throw new Error("not a public business page")
        },
        manager,
      ),
    ).rejects.toThrow("not a public business page")
    expect(removed).toEqual([{ origins: ["https://www.instagram.com/*"] }])
  })

  test("preserves a permission that existed before page approval", async () => {
    let removed = false
    const manager: PermissionManager = {
      async contains() {
        return true
      },
      async request() {
        throw new Error("existing permission should not be requested")
      },
      async remove() {
        removed = true
        return true
      },
    }

    await expect(
      withOriginPermission(
        "https://www.instagram.com/northstar/",
        async () => {
          throw new Error("not a public business page")
        },
        manager,
      ),
    ).rejects.toThrow("not a public business page")
    expect(removed).toBeFalse()
  })

  test("keeps a newly granted permission after approval has committed", async () => {
    let removed = false
    const manager: PermissionManager = {
      async contains() {
        return false
      },
      async request() {
        return true
      },
      async remove() {
        removed = true
        return true
      },
    }

    await expect(
      withOriginPermission(
        "https://example.com/about",
        async () => {
          throw new Error("status refresh failed after commit")
        },
        manager,
        async () => false,
      ),
    ).rejects.toThrow("status refresh failed after commit")
    expect(removed).toBeFalse()
  })
})
