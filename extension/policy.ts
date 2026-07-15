import {
  canonicalHostname,
  isAllowedPublicSourceUrl,
  isPublicGoogleSurfaceHost,
} from "../src/url-policy"

export function isAllowedUrl(rawUrl: string): boolean {
  return isAllowedPublicSourceUrl(rawUrl)
}

export function permissionPatternForUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (!isAllowedUrl(rawUrl)) {
      if (
        url.pathname !== "/" ||
        !isPublicGoogleSurfaceHost(canonicalHostname(url))
      )
        return null
    }
    return `${url.origin}/*`
  } catch {
    return null
  }
}
