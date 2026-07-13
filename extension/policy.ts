export function isAllowedUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl)
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.hostname !== "linkedin.com" &&
    !url.hostname.endsWith(".linkedin.com")
  )
}
