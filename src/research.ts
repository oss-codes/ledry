import type { Lead } from "./schemas"
import {
  canonicalHostname,
  hasSecretUrlMaterial,
  isAllowedPublicSourceUrl,
  isGoogleHost,
  isGoogleMapsUrl,
  isGoogleSearchUrl,
  isLinkedInHost,
  isPrivateRoute,
  isPublicLinkedInOrganizationUrl,
  isSocialHost,
  sanitizePublicUrl,
} from "./url-policy"

export type QuarantinedLead = {
  readonly reason: string
  readonly sourceType: Lead["sourceType"]
}

export type PreparedResearchResults = {
  readonly accepted: readonly Lead[]
  readonly quarantined: readonly QuarantinedLead[]
  readonly skipped: number
}

function isGoogleRedirect(rawUrl: string): boolean {
  if (rawUrl.length === 0) return false
  const url = new URL(rawUrl)
  return (
    isGoogleHost(canonicalHostname(url)) &&
    (url.pathname.startsWith("/searchviewer") || url.pathname === "/url")
  )
}

function quarantineReason(lead: Lead): string | undefined {
  if (!isAllowedPublicSourceUrl(lead.sourceUrl))
    return "Private, authenticated, or unsupported source page"
  if (lead.sourceType === "google-maps" && !isGoogleMapsUrl(lead.sourceUrl))
    return "Google Maps records must originate from a public Maps page"
  if (lead.sourceType === "google-search" && !isGoogleSearchUrl(lead.sourceUrl))
    return "Google Search records must originate from a public Search page"
  const url = new URL(lead.sourceUrl)
  if (isPrivateRoute(url)) return "Private or account-scoped page"
  if (
    isLinkedInHost(canonicalHostname(url)) &&
    !isPublicLinkedInOrganizationUrl(lead.sourceUrl)
  )
    return "LinkedIn extraction is limited to public company and school pages"
  if (
    lead.sourceType === "social" &&
    !lead.tags.includes("public-business-profile")
  )
    return "Social extraction requires explicit public business-page evidence"
  if (
    lead.sourceType === "website" &&
    !lead.tags.includes("public-business-page")
  )
    return "Website extraction requires explicit public business-page evidence"
  for (const candidate of [lead.website, ...lead.socialProfiles]) {
    if (candidate.length === 0) continue
    const destination = new URL(candidate)
    if (hasSecretUrlMaterial(destination) || isPrivateRoute(destination))
      return "Private or authenticated destination URL"
    if (
      isLinkedInHost(canonicalHostname(destination)) &&
      !isPublicLinkedInOrganizationUrl(candidate)
    )
      return "Personal LinkedIn destinations are not business leads"
    if (
      lead.sourceType === "google-search" &&
      isSocialHost(canonicalHostname(destination)) &&
      !isPublicLinkedInOrganizationUrl(candidate)
    )
      return "Search-result social profiles require explicit business-page evidence"
  }
  for (const candidate of lead.socialProfiles) {
    const destination = new URL(candidate)
    if (
      isSocialHost(canonicalHostname(destination)) &&
      !isPublicLinkedInOrganizationUrl(candidate)
    )
      return "Ambiguous personal social-profile destinations are not retained"
  }
  if (
    lead.sourceType === "google-search" &&
    !lead.tags.includes("public-business-search-result")
  )
    return "Google Search candidates require explicit business-result evidence"
  if (/^(?:google account|sign in|signed in as)$/i.test(lead.name.trim()))
    return "Account navigation is not a business lead"
  return undefined
}

function sanitizeLead(lead: Lead): Lead {
  const sourceUrl = sanitizePublicUrl(lead.sourceUrl)
  const website =
    lead.website.length === 0
      ? ""
      : isGoogleRedirect(lead.website)
        ? ""
        : sanitizePublicUrl(lead.website)
  const socialProfiles = lead.socialProfiles.flatMap((candidate) => {
    const sanitized = sanitizePublicUrl(candidate)
    const url = new URL(sanitized)
    if (
      isLinkedInHost(canonicalHostname(url)) &&
      !isPublicLinkedInOrganizationUrl(sanitized)
    )
      return []
    return [sanitized]
  })
  return {
    ...lead,
    id: lead.id === `lead:${lead.sourceUrl}` ? `lead:${sourceUrl}` : lead.id,
    sourceUrl,
    website,
    socialProfiles,
    evidence: lead.evidence.flatMap((item) => {
      if (item.field === "website" && website.length === 0) return []
      return [{ ...item, sourceUrl }]
    }),
  }
}

export function prepareResearchResults(
  leads: readonly Lead[],
  limit: number,
): PreparedResearchResults {
  const accepted: Lead[] = []
  const quarantined: QuarantinedLead[] = []
  let skipped = 0
  for (const candidate of leads) {
    const reason = quarantineReason(candidate)
    const lead = sanitizeLead(candidate)
    if (reason !== undefined) {
      quarantined.push({ reason, sourceType: lead.sourceType })
      continue
    }
    if (accepted.length >= limit) {
      skipped += 1
      continue
    }
    accepted.push(lead)
  }
  return { accepted, quarantined, skipped }
}
