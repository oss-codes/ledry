import { describe, expect, test } from "bun:test"
import { isAllowedUrl, permissionPatternForUrl } from "../extension/policy"

describe("source policy", () => {
  test("allows public HTTP sources", () => {
    expect(isAllowedUrl("https://www.google.com/maps/search/plumbers")).toBe(
      true,
    )
    expect(isAllowedUrl("https://www.google.co.in/maps/search/plumbers")).toBe(
      true,
    )
    expect(isAllowedUrl("https://www.google.com/maps/timeline")).toBe(false)
    expect(isAllowedUrl("https://www.google.com/maps/saved")).toBe(false)
    expect(
      isAllowedUrl("https://www.google.com/maps/contrib/123/reviews"),
    ).toBe(false)
    expect(isAllowedUrl("https://example.com/contact")).toBe(true)
  })

  test("limits LinkedIn to public organization pages", () => {
    expect(isAllowedUrl("https://linkedin.com/in/example")).toBe(false)
    expect(isAllowedUrl("https://uk.linkedin.com/in/example")).toBe(false)
    expect(
      isAllowedUrl("https://deep.region.linkedin.com/company/example"),
    ).toBe(true)
    expect(isAllowedUrl("https://www.linkedin.com/school/example/")).toBe(true)
    expect(
      isAllowedUrl("https://www.linkedin.com/company/example/admin/"),
    ).toBe(false)
    expect(isAllowedUrl("https://www.linkedin.com./in/private-person/")).toBe(
      false,
    )
  })

  test("blocks private applications and URLs containing secret material", () => {
    expect(isAllowedUrl("https://mail.google.com/mail/u/0/")).toBe(false)
    expect(isAllowedUrl("https://mail.google.com/search?q=lead")).toBe(false)
    expect(isAllowedUrl("https://drive.google.com/search?q=lead")).toBe(false)
    expect(isAllowedUrl("https://example.com/leads?access_token=secret")).toBe(
      false,
    )
    expect(isAllowedUrl("https://example.com/dashboard/leads")).toBe(false)
    expect(isAllowedUrl("https://example.com/portal")).toBe(false)
    expect(isAllowedUrl("https://example.com/%70ortal")).toBe(false)
    expect(isAllowedUrl("https://example.com/%41ccount")).toBe(false)
    expect(isAllowedUrl("https://example.com/%2541ccount")).toBe(false)
    expect(isAllowedUrl("https://instagram.com/my-account")).toBe(false)
    expect(isAllowedUrl("https://instagram.com/wp-admin")).toBe(false)
    expect(isAllowedUrl("https://example.com/home")).toBe(false)
    expect(isAllowedUrl("https://instagram.com/%E0%A4%A")).toBe(false)
    expect(isAllowedUrl("https://example.com/#access_token=abc123")).toBe(false)
    expect(isAllowedUrl("https://example.com/#id_token=eyJabc.def.ghi")).toBe(
      false,
    )
    expect(isAllowedUrl("https://example.com/#/account?view=private")).toBe(
      false,
    )
    expect(isAllowedUrl("https://example.com/#%2Faccount%3Ftoken%3Dabc")).toBe(
      false,
    )
    for (const fragment of [
      "account",
      "dashboard",
      "profile",
      "!dashboard",
      "route=/account",
      "customer-portal",
      "accounts",
      "manage",
      "member",
      "app",
      "/team",
      "route=/team",
      "/my-account",
      "/wp-admin",
      "/Account",
      "/%41ccount",
      "!/DASHBOARD",
      "%2FSETTINGS",
    ])
      expect(isAllowedUrl(`https://example.com/#${fragment}`)).toBe(false)
    expect(isAllowedUrl("https://example.com/#about")).toBe(true)
    expect(isAllowedUrl("https://example.com/#team")).toBe(true)
    expect(isAllowedUrl("https://example.com/#people")).toBe(true)
    let deeplyEncodedSecret = "token=abc"
    let deeplyEncodedRoute = "/account"
    for (let pass = 0; pass < 10; pass += 1) {
      deeplyEncodedSecret = encodeURIComponent(deeplyEncodedSecret)
      deeplyEncodedRoute = encodeURIComponent(deeplyEncodedRoute)
    }
    expect(isAllowedUrl(`https://example.com/#${deeplyEncodedSecret}`)).toBe(
      false,
    )
    expect(isAllowedUrl(`https://example.com/#${deeplyEncodedRoute}`)).toBe(
      false,
    )
    for (const key of [
      "token",
      "refresh_token",
      "id_token",
      "sessionid",
      "jwt",
      "sig",
      "SAMLResponse",
      "X-Amz-Credential",
      "authToken",
      "sessionToken",
      "apiKey",
      "accessKeyId",
      "clientAssertion",
      "SAMLart",
      "ticket",
      "bearer",
    ])
      expect(isAllowedUrl(`https://example.com/?${key}=secret`)).toBe(false)
    expect(
      isAllowedUrl(
        "https://example.com/?next=https%3A%2F%2Fidp.example%2Fcallback%3Ftoken%3Dsecret",
      ),
    ).toBe(false)
  })

  test("rejects Google lookalike domains", () => {
    expect(isAllowedUrl("https://google.evil.com/maps")).toBe(false)
    expect(isAllowedUrl("https://maps.google.evil.co/search")).toBe(false)
    expect(permissionPatternForUrl("https://mail.google.com/search")).toBeNull()
  })

  test("rejects privileged schemes", () => {
    expect(isAllowedUrl("file:///tmp/leads.html")).toBe(false)
    expect(isAllowedUrl("chrome://settings")).toBe(false)
  })

  test("rejects an incomplete browser URL without throwing", () => {
    expect(isAllowedUrl("")).toBe(false)
    expect(isAllowedUrl("not a URL")).toBe(false)
  })

  test("creates a permission pattern for only the approved origin", () => {
    expect(permissionPatternForUrl("https://example.com/contact?page=2")).toBe(
      "https://example.com/*",
    )
    expect(
      permissionPatternForUrl("https://linkedin.com/company/example"),
    ).toBe("https://linkedin.com/*")
    expect(
      permissionPatternForUrl("https://www.google.com/maps/search/coffee"),
    ).toBe("https://www.google.com/*")
    expect(
      permissionPatternForUrl("https://user:pass@www.google.com/"),
    ).toBeNull()
    expect(
      permissionPatternForUrl("https://www.google.com/?token=abc"),
    ).toBeNull()
    expect(
      permissionPatternForUrl("https://www.google.com/#/account"),
    ).toBeNull()
  })
})
