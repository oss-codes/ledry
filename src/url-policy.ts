const PRIVATE_ROUTE =
  /\/(?:account|accounts|admin|analytics|app|author|billing|checkout|client|clients|console|customer|customer-portal|customers|dashboard|direct|inbox|internal|login|manage|member|messages|people|portal|profile|secure|settings|staff|team|users|workspace)(?:\/|$)/
const AUTHENTICATED_ROUTE =
  /\/(?:admin|analytics|dashboard|direct|inbox|internal|manage|messages|my-account|profile|settings|users|workspace|wp-admin)(?:\/|$)/
const PRIVATE_FRAGMENT_SEGMENT =
  /^(?:account|accounts|admin|analytics|app|billing|checkout|console|customer-portal|dashboard|direct|inbox|internal|login|manage|member|messages|my-account|portal|profile|secure|settings|users|workspace|wp-admin)$/
const GOOGLE_SUFFIX = /^(?:com|cat|[a-z]{2}|(?:co|com)\.[a-z]{2})$/
const PRIVATE_GOOGLE_HOSTS = new Set([
  "accounts.google.com",
  "calendar.google.com",
  "chat.google.com",
  "docs.google.com",
  "drive.google.com",
  "mail.google.com",
  "meet.google.com",
  "photos.google.com",
])

export function canonicalHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.+$/, "")
}

export function isGoogleHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "")
  const labels = host.split(".")
  const googleLabel = labels.lastIndexOf("google")
  return (
    googleLabel >= 0 &&
    GOOGLE_SUFFIX.test(labels.slice(googleLabel + 1).join("."))
  )
}

export function isPublicGoogleSurfaceHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "")
  if (!isGoogleHost(host) || PRIVATE_GOOGLE_HOSTS.has(host)) return false
  const labels = host.split(".")
  const googleLabel = labels.lastIndexOf("google")
  const prefixes = labels.slice(0, googleLabel)
  return prefixes.every((label) => label === "www" || label === "maps")
}

export function isGoogleMapsUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const host = canonicalHostname(url)
    if (!isPublicGoogleSurfaceHost(host)) return false
    const pathname = canonicalPathname(url)
    return (
      pathname === "/maps/search" ||
      pathname.startsWith("/maps/search/") ||
      pathname === "/maps/place" ||
      pathname.startsWith("/maps/place/")
    )
  } catch {
    return false
  }
}

export function isGoogleSearchUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return (
      isPublicGoogleSurfaceHost(canonicalHostname(url)) &&
      url.pathname === "/search"
    )
  } catch {
    return false
  }
}

export function isLinkedInHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "")
  return host === "linkedin.com" || host.endsWith(".linkedin.com")
}

export function isSocialHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "")
  return /(^|\.)(?:instagram|facebook|tiktok|x|twitter|youtube|linkedin)\.com$/.test(
    host,
  )
}

export function isPublicLinkedInOrganizationUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (!isLinkedInHost(canonicalHostname(url))) return false
    if (PRIVATE_ROUTE.test(url.pathname.toLowerCase())) return false
    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length < 2 || (parts[0] !== "company" && parts[0] !== "school"))
      return false
    return (
      parts.length === 2 ||
      (parts.length === 3 &&
        ["about", "jobs", "life", "people", "posts"].includes(
          parts[2]?.toLowerCase() ?? "",
        ))
    )
  } catch {
    return false
  }
}

export function hasSecretUrlMaterial(url: URL): boolean {
  if (url.username.length > 0 || url.password.length > 0) return true
  if (
    [...url.searchParams].some(
      ([key, value]) => isSecretQueryKey(key) || hasNestedSecretMaterial(value),
    )
  )
    return true
  return url.hash.length > 1 && hasNestedSecretMaterial(url.hash.slice(1))
}

export function isPrivateRoute(url: URL): boolean {
  return PRIVATE_ROUTE.test(canonicalPathname(url))
}

export function isAuthenticatedRoute(url: URL): boolean {
  return AUTHENTICATED_ROUTE.test(canonicalPathname(url))
}

function isPrivateHashRoute(url: URL): boolean {
  const decoded = decodeRepeatedly(url.hash.slice(1))
  if (decoded === null) return true
  const fragment = decoded.toLowerCase()
  if (
    fragment.includes("/") ||
    fragment.includes("=") ||
    fragment.startsWith("!")
  ) {
    const route = `/${fragment.replace(/^!/, "").replace(/[?&#=]+/g, "/")}`
    return PRIVATE_ROUTE.test(route) || AUTHENTICATED_ROUTE.test(route)
  }
  return PRIVATE_FRAGMENT_SEGMENT.test(fragment)
}

export function sanitizePublicUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  url.username = ""
  url.password = ""
  url.hash = ""
  for (const [key, value] of [...url.searchParams]) {
    if (isSecretQueryKey(key) || hasNestedSecretMaterial(value))
      url.searchParams.delete(key)
  }
  return url.toString()
}

function isSecretQueryKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (normalized.includes("token")) return true
  if (
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("credential") ||
    normalized.includes("signature")
  )
    return true
  return new Set([
    "accesskeyid",
    "apikey",
    "auth",
    "authorization",
    "bearer",
    "clientassertion",
    "code",
    "idpassertion",
    "jwt",
    "key",
    "privatekey",
    "samlart",
    "samlresponse",
    "session",
    "sessionid",
    "sig",
    "ticket",
    "xamzcredential",
    "xamzsignature",
  ]).has(normalized)
}

function hasNestedSecretMaterial(value: string): boolean {
  const decoded = decodeRepeatedly(value.replace(/\+/g, " "))
  if (decoded === null) return true
  return hasDecodedSecretMaterial(decoded)
}

function hasDecodedSecretMaterial(decoded: string): boolean {
  if (/\bbearer\s+[a-z0-9._~+/=-]+/i.test(decoded)) return true
  if (/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/i.test(decoded)) return true
  for (const match of decoded.matchAll(
    /(?:^|[?&#;\s])([a-z][a-z0-9_.-]{0,79})\s*=/gi,
  )) {
    if (isSecretQueryKey(match[1] ?? "")) return true
  }
  return false
}

function decodeRepeatedly(value: string): string | null {
  let decoded = value
  try {
    for (let pass = 0; pass < 8; pass += 1) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) return decoded
      decoded = next
    }
    return decodeURIComponent(decoded) === decoded ? decoded : null
  } catch {
    return null
  }
}

export function isAllowedPublicSourceUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    if (
      hasSecretUrlMaterial(url) ||
      isPrivateRoute(url) ||
      isAuthenticatedRoute(url) ||
      isPrivateHashRoute(url)
    )
      return false
    const host = canonicalHostname(url)
    if (isLinkedInHost(host)) return isPublicLinkedInOrganizationUrl(rawUrl)
    if (PRIVATE_GOOGLE_HOSTS.has(host)) return false
    if (isGoogleHost(host))
      return isGoogleMapsUrl(rawUrl) || isGoogleSearchUrl(rawUrl)
    if (host.split(".").includes("google")) return false
    if (
      host === "web.whatsapp.com" ||
      host === "app.slack.com" ||
      host === "discord.com" ||
      host === "outlook.live.com"
    )
      return false
    if (isSocialHost(host)) return true
    return isPublicBusinessWebsiteRoute(url)
  } catch {
    return false
  }
}

function canonicalPathname(url: URL): string {
  const pathname = decodeRepeatedly(url.pathname)
  return pathname === null
    ? "/internal/invalid-encoding"
    : pathname.toLowerCase().replace(/\/{2,}/g, "/")
}

function isPublicBusinessWebsiteRoute(url: URL): boolean {
  const parts = canonicalPathname(url).split("/").filter(Boolean)
  if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(parts[0] ?? "")) parts.shift()
  if (parts.length === 0) return true
  if (
    [
      "about",
      "about-us",
      "business",
      "company",
      "contact",
      "contact-us",
      "locations",
      "our-company",
      "products",
      "services",
      "stores",
    ].includes(parts[0] ?? "")
  )
    return (
      parts.length === 1 || ["locations", "stores"].includes(parts[0] ?? "")
    )
  return false
}
