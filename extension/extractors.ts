import type { Lead } from "../src/schemas"

export type ExtractionContext = {
  readonly document: Document
  readonly pageUrl: string
  readonly capturedAt: string
}

function text(element: Element | null | undefined): string {
  return element?.textContent?.trim() ?? ""
}

function evidence(
  context: ExtractionContext,
  field: string,
  value: string,
): Lead["evidence"][number] {
  return { field, value, sourceUrl: context.pageUrl }
}

export function extractMaps(context: ExtractionContext): readonly Lead[] {
  const links = [
    ...context.document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/maps/place/"]',
    ),
  ]
  const seen = new Set<string>()
  return links.slice(0, 500).flatMap((link) => {
    const sourceUrl = link.href
    if (seen.has(sourceUrl)) return []
    seen.add(sourceUrl)
    const card =
      link.closest('article, [role="article"]') ??
      link.parentElement?.parentElement
    const name = link.getAttribute("aria-label")?.trim() || text(link)
    if (name.length === 0) return []
    const cardText = text(card)
    const website =
      card?.querySelector<HTMLAnchorElement>(
        'a[href^="http"]:not([href*="google.com/maps"])',
      )?.href ?? ""
    const phone = cardText.match(/(?:\+?\d[\d ()-]{7,}\d)/)?.[0]?.trim()
    const address =
      cardText
        .split("·")
        .find((part) => /\d/.test(part) && part.length > 8)
        ?.trim() ?? ""
    const values = [evidence(context, "name", name)]
    if (website.length > 0) values.push(evidence(context, "website", website))
    if (phone !== undefined) values.push(evidence(context, "phone", phone))
    if (address.length > 0) values.push(evidence(context, "address", address))
    return [
      {
        id: `lead:${sourceUrl}`,
        name,
        organization: name,
        category: "",
        website,
        emails: [],
        phones: phone === undefined ? [] : [phone],
        socialProfiles: [],
        address,
        sourceUrl,
        sourceType: "google-maps",
        capturedAt: context.capturedAt,
        evidence: values,
        confidence: 0.75,
        score: 0,
        tags: [],
      } satisfies Lead,
    ]
  })
}

export function extractSearch(context: ExtractionContext): readonly Lead[] {
  const seen = new Set<string>()
  return [...context.document.querySelectorAll<HTMLHeadingElement>("a h3")]
    .slice(0, 500)
    .flatMap((heading) => {
      const link = heading.closest("a")
      if (link === null || !link.href.startsWith("http") || seen.has(link.href))
        return []
      const url = new URL(link.href)
      if (url.hostname.includes("google.")) return []
      seen.add(link.href)
      const name = text(heading)
      if (name.length === 0) return []
      return [
        {
          id: `lead:${link.href}`,
          name,
          organization: url.hostname.replace(/^www\./, ""),
          category: "",
          website: link.href,
          emails: [],
          phones: [],
          socialProfiles: [],
          address: "",
          sourceUrl: context.pageUrl,
          sourceType: "google-search",
          capturedAt: context.capturedAt,
          evidence: [
            evidence(context, "name", name),
            evidence(context, "website", link.href),
          ],
          confidence: 0.7,
          score: 0,
          tags: [],
        } satisfies Lead,
      ]
    })
}

export function extractWebsite(
  context: ExtractionContext,
  sourceType: "website" | "social",
): readonly Lead[] {
  const bodyText = context.document.body.textContent ?? ""
  const emails = [
    ...new Set(bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
  ].slice(0, 20)
  const phones = [
    ...new Set(
      bodyText
        .match(/(?:\+?\d[\d ()-]{7,}\d)/g)
        ?.map((value) => value.trim()) ?? [],
    ),
  ].slice(0, 20)
  const socialProfiles = [
    ...new Set(
      [...context.document.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .map((link) => link.href)
        .filter((href) =>
          /(instagram|facebook|x\.com|twitter|tiktok|youtube)\.com/.test(href),
        ),
    ),
  ].slice(0, 30)
  const name =
    context.document
      .querySelector('meta[property="og:site_name"]')
      ?.getAttribute("content")
      ?.trim() ||
    context.document.title.split(/[|–—-]/)[0]?.trim() ||
    new URL(context.pageUrl).hostname
  return [
    {
      id: `lead:${context.pageUrl}`,
      name,
      organization: name,
      category: "",
      website: context.pageUrl,
      emails,
      phones,
      socialProfiles,
      address: "",
      sourceUrl: context.pageUrl,
      sourceType,
      capturedAt: context.capturedAt,
      evidence: [
        evidence(context, "name", name),
        evidence(context, "website", context.pageUrl),
        ...emails.map((value) => evidence(context, "email", value)),
        ...phones.map((value) => evidence(context, "phone", value)),
        ...socialProfiles.map((value) =>
          evidence(context, "socialProfile", value),
        ),
      ],
      confidence: 0.8,
      score: 0,
      tags: [],
    } satisfies Lead,
  ]
}
