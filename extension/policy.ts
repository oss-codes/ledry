export function isAllowedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "linkedin.com" &&
      !url.hostname.endsWith(".linkedin.com")
    )
  } catch {
    return false
  }
}

export function permissionPatternForUrl(rawUrl: string): string | null {
  if (!isAllowedUrl(rawUrl)) return null
  return `${new URL(rawUrl).origin}/*`
}
