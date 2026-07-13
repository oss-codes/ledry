import { extractMaps, extractSearch, extractWebsite } from "./extractors"

type ContentRequest =
  | { readonly action: "snapshot" }
  | { readonly action: "scroll"; readonly amount: number }
  | {
      readonly action: "extract"
      readonly sourceType:
        | "google-maps"
        | "google-search"
        | "website"
        | "social"
    }

function showIndicator(): void {
  document.querySelector("#ledry-control-indicator")?.remove()
  const indicator = document.createElement("div")
  indicator.id = "ledry-control-indicator"
  indicator.textContent = "Ledry is reading this page"
  Object.assign(indicator.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    background: "#07111f",
    color: "#7dd3fc",
    border: "1px solid #38bdf8",
    borderRadius: "8px",
    padding: "9px 12px",
    font: "600 13px system-ui",
    boxShadow: "0 6px 24px #0006",
  })
  document.documentElement.append(indicator)
  setTimeout(() => indicator.remove(), 1_200)
}

if (document.documentElement.dataset["ledryInjected"] !== "true") {
  document.documentElement.dataset["ledryInjected"] = "true"
  chrome.runtime.onMessage.addListener(
    (request: ContentRequest, _sender, respond) => {
      showIndicator()
      switch (request.action) {
        case "snapshot":
          respond({
            title: document.title,
            url: window.location.href,
            text: document.body.innerText.slice(0, 20_000),
          })
          return false
        case "scroll":
          window.scrollBy({ top: request.amount, behavior: "smooth" })
          respond({ scrolled: request.amount })
          return false
        case "extract": {
          const context = {
            document,
            pageUrl: window.location.href,
            capturedAt: new Date().toISOString(),
          }
          if (request.sourceType === "google-maps")
            respond(extractMaps(context))
          else if (request.sourceType === "google-search")
            respond(extractSearch(context))
          else respond(extractWebsite(context, request.sourceType))
          return false
        }
        default:
          return request satisfies never
      }
    },
  )
}
