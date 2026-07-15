import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { publicSnapshotRoot } from "../extension/content-guard"

describe("content-script public snapshot guard", () => {
  test("scopes a Maps snapshot to results and excludes account chrome", async () => {
    const window = new Window({
      url: "https://www.google.com/maps/search/plumbers",
    })
    window.document.write(
      await Bun.file(
        new URL("fixtures/google-maps.html", import.meta.url),
      ).text(),
    )

    const text = publicSnapshotRoot(window.document, "google-maps")?.textContent

    expect(text).toContain("Northstar Plumbing")
    expect(text).not.toContain("Private Person")
    expect(text).not.toContain("private@example.com")
    window.close()
  })

  test("fails closed when Maps has no public result or detail container", () => {
    const window = new Window({
      url: "https://www.google.com/maps/search/plumbers",
    })
    window.document.body.innerHTML =
      '<nav aria-label="Google Account">private@example.com</nav>'

    expect(publicSnapshotRoot(window.document, "google-maps")).toBeNull()
    window.close()
  })

  test("prefers a nested Maps feed over an earlier main account shell", () => {
    const window = new Window({
      url: "https://www.google.com/maps/search/plumbers",
    })
    window.document.body.innerHTML = `
      <main>
        <nav>Private Person private@example.com</nav>
        <div role="feed"><article>Northstar Plumbing</article></div>
      </main>`

    const text = publicSnapshotRoot(window.document, "google-maps")?.textContent

    expect(text).toContain("Northstar Plumbing")
    expect(text).not.toContain("private@example.com")
    window.close()
  })

  test("returns only explicit public fields from a Maps detail pane", () => {
    const window = new Window({
      url: "https://www.google.com/maps/place/northstar",
    })
    window.document.body.innerHTML = `
      <main>
        <nav>Private Person private@example.com</nav>
        <h1>Northstar Plumbing</h1>
        <button data-item-id="address">123 Public Road</button>
      </main>`

    const text = publicSnapshotRoot(window.document, "google-maps")?.textContent

    expect(text).toContain("Northstar Plumbing")
    expect(text).toContain("123 Public Road")
    expect(text).not.toContain("private@example.com")
    window.close()
  })
})
