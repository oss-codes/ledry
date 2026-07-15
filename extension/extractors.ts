import type { Lead } from "../src/schemas"
import {
  canonicalHostname,
  hasSecretUrlMaterial,
  isAllowedPublicSourceUrl,
  isAuthenticatedRoute,
  isGoogleHost,
  isGoogleMapsUrl,
  isGoogleSearchUrl,
  isPublicLinkedInOrganizationUrl,
  isSocialHost,
  sanitizePublicUrl,
} from "../src/url-policy"

export type ExtractionContext = {
  readonly document: Document
  readonly pageUrl: string
  readonly capturedAt: string
}

export function detectSourceType(
  pageUrl: string,
): "google-maps" | "google-search" | "website" | "social" {
  const host = canonicalHostname(new URL(pageUrl))
  if (isGoogleMapsUrl(pageUrl)) return "google-maps"
  if (isGoogleSearchUrl(pageUrl)) return "google-search"
  if (
    /(^|\.)(?:instagram|facebook|tiktok|x|twitter|youtube|linkedin)\.com$/.test(
      host,
    )
  )
    return "social"
  return "website"
}

function evidence(
  context: ExtractionContext,
  field: string,
  value: string,
): Lead["evidence"][number] {
  return { field, value, sourceUrl: sanitizePublicUrl(context.pageUrl) }
}

function cappedElements<T extends Element>(
  context: ExtractionContext,
  root: Node,
  selector: string,
  limit: number,
): readonly T[] {
  const result: T[] = []
  const walker = context.document.createTreeWalker(root, 1)
  let visited = 0
  let current = walker.nextNode()
  while (current !== null && result.length < limit && visited < 10_000) {
    visited += 1
    if (current instanceof Element && current.matches(selector))
      result.push(current as T)
    current = walker.nextNode()
  }
  return result
}

function cappedText(
  context: ExtractionContext,
  root: Node,
  limit: number,
): string {
  const chunks: string[] = []
  let length = 0
  let visited = 0
  const walker = context.document.createTreeWalker(root, 4)
  let current = walker.nextNode()
  while (current !== null && length < limit && visited < 10_000) {
    visited += 1
    const value = current.textContent ?? ""
    const remaining = limit - length
    chunks.push(value.slice(0, remaining))
    length += Math.min(value.length, remaining)
    current = walker.nextNode()
  }
  return chunks.join(" ")
}

function boundedElementText(
  context: ExtractionContext,
  element: Element | null | undefined,
  limit = 2_000,
): string {
  return element === null || element === undefined
    ? ""
    : cappedText(context, element, limit).trim()
}

function inspectStructuredTypes(
  root: unknown,
  expectedTypes: ReadonlySet<string>,
): {
  readonly incomplete: boolean
  readonly matched: boolean
  readonly names: readonly string[]
} {
  type Vocabulary = {
    readonly terms: ReadonlyMap<string, string>
    readonly typeKeys: ReadonlySet<string>
  }
  type PendingValue = {
    readonly value: unknown
    readonly vocabulary: Vocabulary
  }
  const pending: PendingValue[] = [
    {
      value: root,
      vocabulary: { terms: new Map(), typeKeys: new Set(["@type"]) },
    },
  ]
  const names: string[] = []
  let matched = false
  let visited = 0
  while (pending.length > 0 && visited < 10_000) {
    visited += 1
    const current = pending.pop()
    if (current === undefined) break
    const { value } = current
    if (Array.isArray(value)) {
      for (const item of value)
        pending.push({ value: item, vocabulary: current.vocabulary })
      continue
    }
    if (typeof value !== "object" || value === null) continue
    const record = value as Record<string, unknown>
    let vocabulary = current.vocabulary
    const context = record["@context"]
    const definitions = Array.isArray(context) ? context : [context]
    if (definitions.some((item) => typeof item === "object" && item !== null)) {
      const terms = new Map(vocabulary.terms)
      const typeKeys = new Set(vocabulary.typeKeys)
      for (const definition of definitions) {
        if (typeof definition !== "object" || definition === null) continue
        for (const [alias, mapping] of Object.entries(definition)) {
          if (mapping === null) {
            terms.delete(alias.toLowerCase())
            typeKeys.delete(alias)
            continue
          }
          const identifier =
            typeof mapping === "string"
              ? mapping
              : typeof mapping === "object" &&
                  "@id" in mapping &&
                  typeof mapping["@id"] === "string"
                ? mapping["@id"]
                : undefined
          if (identifier === undefined) continue
          if (identifier === "@type") typeKeys.add(alias)
          else typeKeys.delete(alias)
          const terminal = identifier
            .toLowerCase()
            .replace(/[/#:]+$/, "")
            .split(/[/#:]/)
            .at(-1)
          if (terminal !== undefined) terms.set(alias.toLowerCase(), terminal)
        }
      }
      vocabulary = { terms, typeKeys }
    }
    const rawTypes = [...vocabulary.typeKeys].flatMap((key) => {
      const candidate = record[key]
      return Array.isArray(candidate) ? candidate : [candidate]
    })
    const typeMatches = rawTypes.some((type) => {
      if (typeof type !== "string") return false
      const terminal = type
        .toLowerCase()
        .replace(/[/#:]+$/, "")
        .split(/[/#:]/)
        .at(-1)
      const resolved =
        vocabulary.terms.get(type.toLowerCase()) ??
        vocabulary.terms.get(terminal ?? "") ??
        terminal
      return resolved !== undefined && expectedTypes.has(resolved)
    })
    if (typeMatches) {
      matched = true
      if (typeof record["name"] === "string") names.push(record["name"])
    }
    for (const [key, item] of Object.entries(record)) {
      if (key !== "@context") pending.push({ value: item, vocabulary })
    }
  }
  return { incomplete: pending.length > 0, matched, names }
}

export function hasPublicBusinessEvidence(context: ExtractionContext): boolean {
  if (!isAllowedPublicSourceUrl(context.pageUrl)) return false
  if (isGoogleMapsUrl(context.pageUrl) || isGoogleSearchUrl(context.pageUrl))
    return true
  if (isPublicLinkedInOrganizationUrl(context.pageUrl)) return true
  const openGraphType =
    context.document
      .querySelector('meta[property="og:type"]')
      ?.getAttribute("content")
      ?.toLowerCase() ?? ""
  if (
    openGraphType === "profile" ||
    openGraphType.startsWith("profile.") ||
    openGraphType === "article"
  )
    return false
  const structuredScripts = cappedElements<HTMLScriptElement>(
    context,
    context.document,
    'script[type="application/ld+json"]',
    21,
  )
  let structuredEnvelopeIncomplete = structuredScripts.length > 20
  const structuredValues: unknown[] = []
  for (const script of structuredScripts.slice(0, 20)) {
    const value = script.textContent ?? ""
    if (value.length > 100_000) {
      structuredEnvelopeIncomplete = true
      continue
    }
    try {
      structuredValues.push(JSON.parse(value) as unknown)
    } catch {
      structuredEnvelopeIncomplete = true
    }
  }
  if (structuredEnvelopeIncomplete) return false
  const personalInspections = structuredValues.map((value) =>
    inspectStructuredTypes(value, new Set(["person", "profilepage"])),
  )
  if (
    personalInspections.some(
      (inspection) => inspection.incomplete || inspection.matched,
    )
  )
    return false
  const socialPage = isSocialHost(canonicalHostname(new URL(context.pageUrl)))
  const businessMarker = socialPage
    ? context.document.querySelector(
        '[data-business-category], [data-testid="business-category"], meta[property^="business:contact_data:"]',
      )
    : null
  const businessCategory =
    businessMarker?.getAttribute("content") ??
    boundedElementText(context, businessMarker, 500)
  if (
    /\b(?:actor|athlete|blogger|creator|influencer|model|musician|personal blog|politician|public figure)\b/i.test(
      businessCategory,
    )
  )
    return false
  if (businessMarker !== null) return true
  const authenticatedSessionText = boundedElementText(
    context,
    context.document.body,
    20_000,
  )
  const authenticatedControl = cappedElements<HTMLElement>(
    context,
    context.document,
    "a, button, form, input",
    1_000,
  ).some((element) => {
    const destination =
      element.getAttribute("href") ??
      element.getAttribute("formaction") ??
      element.getAttribute("action")
    if (destination !== null)
      try {
        if (isAuthenticatedRoute(new URL(destination, context.pageUrl)))
          return true
      } catch {
        return true
      }
    const label = [
      boundedElementText(context, element, 500),
      element.getAttribute("aria-label") ?? "",
      element.getAttribute("title") ?? "",
      element.getAttribute("value") ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
    return new Set([
      "account dashboard",
      "log out",
      "logout",
      "my account",
      "profile settings",
      "session menu",
      "sign out",
      "signout",
      "user menu",
      "user settings",
    ]).has(label)
  })
  if (
    !socialPage &&
    (context.document.querySelector(
      'a[href*="/logout"], a[href*="/log-out"], a[href*="/signout"], a[href*="/sign-out"], form[action*="/logout"], form[action*="/signout"], input[type="password"]',
    ) !== null ||
      /\b(?:logged|signed)\s+in\s+as\b|\b(?:log\s*out|logout|sign\s*out|signout)\b/i.test(
        authenticatedSessionText,
      ) ||
      authenticatedControl)
  )
    return false
  const primaryHeading = boundedElementText(
    context,
    context.document.querySelector("h1"),
    500,
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  if (primaryHeading.length === 0) return false
  return structuredValues.some((value) => {
    const inspection = inspectStructuredTypes(
      value,
      new Set([
        "corporation",
        "localbusiness",
        "organization",
        "professionalservice",
        "store",
      ]),
    )
    if (inspection.incomplete) return false
    return inspection.names.some((name) => {
      const normalizedName = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
      return normalizedName.length > 1 && primaryHeading === normalizedName
    })
  })
}

export function extractMaps(context: ExtractionContext): readonly Lead[] {
  const pageUrl = sanitizePublicUrl(context.pageUrl)
  const feed = context.document.querySelector('[role="feed"]')
  if (feed === null) {
    const main = context.document.querySelector("main")
    const name = boundedElementText(context, main?.querySelector("h1"), 500)
    if (main === null || name.length === 0) return []
    const address = boundedElementText(
      context,
      main.querySelector('[data-item-id="address"]'),
    )
    const phone = boundedElementText(
      context,
      main.querySelector('[data-item-id^="phone:tel:"]'),
    )
    const category = boundedElementText(
      context,
      main.querySelector('[jsaction*="pane.rating.category"]'),
    )
    const websiteCandidate = main.querySelector<HTMLAnchorElement>(
      'a[data-item-id="authority"]',
    )?.href
    const websiteUrl =
      websiteCandidate === undefined ? undefined : new URL(websiteCandidate)
    const website =
      websiteCandidate === undefined ||
      websiteUrl === undefined ||
      hasSecretUrlMaterial(websiteUrl) ||
      (isGoogleHost(canonicalHostname(websiteUrl)) &&
        websiteUrl.pathname.startsWith("/searchviewer"))
        ? ""
        : sanitizePublicUrl(websiteCandidate)
    const values = [evidence(context, "name", name)]
    if (category.length > 0)
      values.push(evidence(context, "category", category))
    if (address.length > 0) values.push(evidence(context, "address", address))
    if (phone.length > 0) values.push(evidence(context, "phone", phone))
    if (website.length > 0) values.push(evidence(context, "website", website))
    return [
      {
        id: `lead:${pageUrl}`,
        name,
        organization: name,
        category,
        website,
        emails: [],
        phones: phone.length === 0 ? [] : [phone],
        socialProfiles: [],
        address,
        sourceUrl: pageUrl,
        sourceType: "google-maps",
        capturedAt: context.capturedAt,
        evidence: values,
        confidence: 0.9,
        score: 0,
        tags: [],
      } satisfies Lead,
    ]
  }
  const links = cappedElements<HTMLAnchorElement>(
    context,
    feed,
    'a[href*="/maps/place/"]',
    500,
  )
  const seen = new Set<string>()
  return links.flatMap((link) => {
    const sourceUrl = sanitizePublicUrl(link.href)
    if (seen.has(sourceUrl)) return []
    seen.add(sourceUrl)
    const card =
      link.closest('article, [role="article"]') ??
      link.parentElement?.parentElement
    const name =
      link.getAttribute("aria-label")?.trim().slice(0, 500) ||
      boundedElementText(context, link, 500)
    if (name.length === 0) return []
    const cardText = boundedElementText(context, card, 20_000)
    const website =
      (card === null || card === undefined
        ? []
        : cappedElements<HTMLAnchorElement>(
            context,
            card,
            'a[href^="http"]',
            30,
          )
      )
        .map((candidate) => candidate.href)
        .find((href) => {
          const url = new URL(href)
          return (
            !isGoogleHost(canonicalHostname(url)) && !hasSecretUrlMaterial(url)
          )
        }) ?? ""
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
  return cappedElements<HTMLHeadingElement>(
    context,
    context.document,
    "a h3",
    500,
  ).flatMap((heading) => {
    const link = heading.closest("a")
    if (link === null || !link.href.startsWith("http") || seen.has(link.href))
      return []
    const url = new URL(link.href)
    if (isGoogleHost(canonicalHostname(url)) || hasSecretUrlMaterial(url))
      return []
    const website = sanitizePublicUrl(link.href)
    seen.add(website)
    const name = boundedElementText(context, heading, 500)
    if (name.length === 0) return []
    const resultRoot =
      heading.closest("article, .g, [data-hveid]") ??
      link.parentElement?.parentElement ??
      link
    const resultText = boundedElementText(context, resultRoot, 4_000)
    if (
      !/\b(?:agency|business|cafe|clinic|coffee|company|consulting|corporation|firm|hotel|inc|llc|ltd|manufacturer|official|plumb(?:er|ing)?|professional|restaurant|roaster|school|services?|shop|solutions|store|studio|supplier|university)\b/i.test(
        `${name} ${resultText}`,
      )
    )
      return []
    return [
      {
        id: `lead:${website}`,
        name,
        organization: url.hostname.replace(/^www\./, ""),
        category: "",
        website,
        emails: [],
        phones: [],
        socialProfiles: [],
        address: "",
        sourceUrl: sanitizePublicUrl(context.pageUrl),
        sourceType: "google-search",
        capturedAt: context.capturedAt,
        evidence: [
          evidence(context, "name", name),
          evidence(context, "website", website),
        ],
        confidence: 0.7,
        score: 0,
        tags: ["public-business-search-result"],
      } satisfies Lead,
    ]
  })
}

export function extractWebsite(
  context: ExtractionContext,
  sourceType: "website" | "social",
): readonly Lead[] {
  if (!hasPublicBusinessEvidence(context)) return []
  const pageUrl = sanitizePublicUrl(context.pageUrl)
  const publicRoot =
    context.document.querySelector("main") ?? context.document.body
  const metadataText = [
    context.document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content") ?? "",
    context.document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") ?? "",
  ].join(" ")
  const contactText = [
    metadataText,
    ...(sourceType === "website"
      ? [cappedText(context, publicRoot, 100_000)]
      : []),
    ...cappedElements<HTMLAnchorElement>(
      context,
      publicRoot,
      'a[href^="mailto:"], a[href^="tel:"]',
      40,
    ).map((link) => link.getAttribute("href") ?? ""),
  ].join(" ")
  const emails = [
    ...new Set(
      contactText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [],
    ),
  ].slice(0, 20)
  const phones = [
    ...new Set(
      contactText
        .match(/(?:\+?\d[\d ()-]{7,}\d)/g)
        ?.map((value) => value.trim()) ?? [],
    ),
  ].slice(0, 20)
  const socialProfiles = [
    ...new Set(
      cappedElements<HTMLAnchorElement>(
        context,
        publicRoot,
        "a[data-business-profile][href]",
        30,
      ).flatMap((link) => {
        const href = sanitizePublicUrl(link.href)
        return isPublicLinkedInOrganizationUrl(href) ? [href] : []
      }),
    ),
  ].slice(0, 30)
  const name =
    context.document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content")
      ?.trim()
      .slice(0, 500) ||
    context.document
      .querySelector('meta[property="og:site_name"]')
      ?.getAttribute("content")
      ?.trim()
      .slice(0, 500) ||
    context.document.title
      .split(/[|–—-]/)[0]
      ?.trim()
      .slice(0, 500) ||
    canonicalHostname(new URL(pageUrl))
  return [
    {
      id: `lead:${pageUrl}`,
      name,
      organization: name,
      category: "",
      website: pageUrl,
      emails,
      phones,
      socialProfiles,
      address: "",
      sourceUrl: pageUrl,
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
      tags:
        sourceType === "social"
          ? ["public-business-profile"]
          : ["public-business-page"],
    } satisfies Lead,
  ]
}
