import { isAllowedPublicSourceUrl, sanitizePublicUrl } from "../src/url-policy"
import { publicSnapshotRoot } from "./content-guard"
import {
  detectSourceType,
  extractMaps,
  extractSearch,
  extractWebsite,
  hasPublicBusinessEvidence,
} from "./extractors"

type ContentRequest =
  | { readonly action: "snapshot" }
  | { readonly action: "scroll"; readonly amount: number }
  | { readonly action: "classify" }
  | {
      readonly action: "extract"
      readonly sourceType:
        | "auto"
        | "google-maps"
        | "google-search"
        | "website"
        | "social"
    }

type ContentFailure = { readonly ledryError: string }

function classifyCurrentPage() {
  const rawUrl = window.location.href
  const context = {
    document,
    pageUrl: sanitizePublicUrl(rawUrl),
    capturedAt: new Date().toISOString(),
  }
  const sourceType = detectSourceType(context.pageUrl)
  return {
    context,
    sourceType,
    publicBusiness:
      isAllowedPublicSourceUrl(rawUrl) &&
      (sourceType === "google-maps" ||
        sourceType === "google-search" ||
        hasPublicBusinessEvidence(context)),
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) =>
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => resolve()),
    ),
  )
}

function showIndicator(label: string): () => Promise<void> {
  const startedAt = performance.now()
  document.querySelector("#ledry-control-indicator")?.remove()
  const host = document.createElement("div")
  host.id = "ledry-control-indicator"
  Object.assign(host.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
  })
  const shadow = host.attachShadow({ mode: "closed" })
  const style = document.createElement("style")
  style.textContent = `
    :host { all: initial; }
    .edge { position: fixed; inset: 5px; border: 1px solid rgb(56 189 248 / .9); border-radius: 12px; box-shadow: inset 0 0 34px rgb(14 165 233 / .22), 0 0 24px rgb(34 211 238 / .2); animation: ledry-pulse 1.4s ease-in-out infinite; transition: opacity 180ms ease-out; }
    .pill { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 9px; padding: 9px 13px; border: 1px solid rgb(125 211 252 / .55); border-radius: 999px; color: #e0f2fe; background: rgb(7 17 31 / .94); box-shadow: 0 12px 36px rgb(2 8 23 / .42); font: 600 13px/1 system-ui, sans-serif; transition: opacity 180ms ease-out, transform 180ms ease-out; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 14px #22d3ee; animation: ledry-dot 1s ease-in-out infinite; }
    .cursor { position: fixed; left: 25%; top: 28%; width: 15px; height: 20px; filter: drop-shadow(0 0 8px #38bdf8); animation: ledry-cursor 1.6s cubic-bezier(.2,.8,.2,1) infinite alternate; transition: opacity 180ms ease-out; }
    .cursor::before { content: ""; display: block; width: 0; height: 0; border-left: 7px solid #e0f2fe; border-right: 7px solid transparent; border-bottom: 17px solid transparent; transform: rotate(-13deg); }
    @keyframes ledry-pulse { 50% { opacity: .62; } }
    @keyframes ledry-dot { 50% { transform: scale(.65); opacity: .55; } }
    @keyframes ledry-cursor { to { transform: translate3d(38vw, 28vh, 0); } }
    @media (prefers-reduced-motion: reduce) { .edge, .dot, .cursor { animation: none; } .cursor { display: none; } }
  `
  const edge = document.createElement("div")
  edge.className = "edge"
  const pill = document.createElement("div")
  pill.className = "pill"
  pill.setAttribute("role", "status")
  const dot = document.createElement("span")
  dot.className = "dot"
  const copy = document.createElement("span")
  copy.textContent = label
  pill.append(dot, copy)
  const cursor = document.createElement("span")
  cursor.className = "cursor"
  shadow.append(style, edge, pill, cursor)
  document.documentElement.append(host)
  return async () => {
    await nextPaint()
    await wait(Math.max(0, 480 - (performance.now() - startedAt)))
    pill.style.opacity = "0"
    pill.style.transform = "translateX(-50%) translateY(4px)"
    edge.style.opacity = "0"
    cursor.style.opacity = "0"
    await wait(180)
    host.remove()
  }
}

if (document.documentElement.dataset["ledryInjected"] !== "true") {
  document.documentElement.dataset["ledryInjected"] = "true"
  chrome.runtime.onMessage.addListener(
    (request: ContentRequest, _sender, respond) => {
      void (async () => {
        const finishIndicator =
          request.action === "classify"
            ? async () => undefined
            : showIndicator(
                request.action === "extract"
                  ? "Ledry is finding public business data"
                  : `Ledry is controlling this ${request.action}`,
              )
        let response: unknown
        const classification = classifyCurrentPage()
        if (request.action !== "classify" && !classification.publicBusiness) {
          const failure: ContentFailure = {
            ledryError:
              "This page no longer exposes explicit public business-page evidence",
          }
          await finishIndicator()
          respond(failure)
          return
        }
        switch (request.action) {
          case "classify": {
            response = {
              sourceType: classification.sourceType,
              publicBusiness: classification.publicBusiness,
            }
            break
          }
          case "snapshot": {
            const root = publicSnapshotRoot(document, classification.sourceType)
            response =
              root === null
                ? ({
                    ledryError:
                      "No public results container is visible on this page",
                  } satisfies ContentFailure)
                : {
                    title: document.title,
                    url: classification.context.pageUrl,
                    text: (root.textContent ?? "").slice(0, 20_000),
                  }
            break
          }
          case "scroll":
            window.scrollBy({
              top: request.amount,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
            })
            response = { scrolled: request.amount }
            break
          case "extract": {
            const { context } = classification
            const sourceType =
              request.sourceType === "auto"
                ? detectSourceType(context.pageUrl)
                : request.sourceType
            const detectedSourceType = detectSourceType(context.pageUrl)
            if (
              request.sourceType !== "auto" &&
              request.sourceType !== detectedSourceType
            ) {
              response = []
              break
            }
            if (sourceType === "google-maps") response = extractMaps(context)
            else if (sourceType === "google-search")
              response = extractSearch(context)
            else response = extractWebsite(context, sourceType)
            break
          }
          default:
            return request satisfies never
        }
        await finishIndicator()
        respond(response)
      })()
      return true
    },
  )
}
