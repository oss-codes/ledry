import type { SourceType } from "../src/schemas"

const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "youtube.com",
  "linkedin.com",
] as const
const GOOGLE_SUFFIX = /^(?:com|cat|[a-z]{2}|(?:co|com)\.[a-z]{2})$/

export function sourceTypeForUrl(value: string): SourceType {
  const url = new URL(value)
  const hostname = url.hostname.replace(/^www\./, "")
  const labels = hostname.split(".")
  const googleLabel = labels.lastIndexOf("google")
  const googleHost =
    googleLabel >= 0 &&
    GOOGLE_SUFFIX.test(labels.slice(googleLabel + 1).join("."))
  if (googleHost)
    return url.pathname.startsWith("/maps") ? "google-maps" : "google-search"
  return SOCIAL_HOSTS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  )
    ? "social"
    : "website"
}
