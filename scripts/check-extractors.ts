import { strict as assert } from "node:assert"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import {
  detectSourceType,
  type ExtractionContext,
  extractMaps,
  extractSearch,
  extractWebsite,
} from "../extension/extractors"

async function fixture(name: string, url: string): Promise<ExtractionContext> {
  document.open()
  document.write(
    await Bun.file(`${import.meta.dir}/../tests/fixtures/${name}`).text(),
  )
  document.close()
  return { document, pageUrl: url, capturedAt: "2026-07-12T00:00:00.000Z" }
}

GlobalRegistrator.register()

const website = extractWebsite(
  await fixture("business.html", "https://northstar.example/"),
  "website",
)
assert.equal(website.length, 1)
assert.deepEqual(website[0]?.emails, ["hello@northstar.example"])
assert.deepEqual(website[0]?.phones, ["+91 98765 43210"])
assert.deepEqual(website[0]?.socialProfiles, [])
assert.equal(
  website[0]?.evidence.some((item) => item.field === "socialProfile"),
  false,
)

const search = extractSearch(
  await fixture(
    "google-search.html",
    "https://www.google.com/search?q=plumbers+pune",
  ),
)
assert.equal(search.length, 2)
assert.deepEqual(
  search.map((lead) => lead.website),
  ["https://northstar.example/", "https://second.example/"],
)

const teamPage = extractWebsite(
  await fixture("business.html", "https://northstar.example/team/alice"),
  "website",
)
assert.equal(teamPage.length, 0)

for (const path of ["about/alice", "leadership/alice"]) {
  document.open()
  document.write(`<!doctype html>
    <head>
      <meta property="og:site_name" content="Acme">
      <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
    </head>
    <main><h1>Alice Doe</h1><p>alice.personal@example.com</p></main>`)
  document.close()
  assert.equal(
    extractWebsite(
      {
        document,
        pageUrl: `https://acme.example/${path}`,
        capturedAt: "2026-07-12T00:00:00.000Z",
      },
      "website",
    ).length,
    0,
  )
}

for (const heading of ["Alice Doe - Acme", "Acme - Alice Doe"]) {
  document.open()
  document.write(`<!doctype html>
    <head><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script></head>
    <main><h1>${heading}</h1><p>alice.personal@example.com</p></main>`)
  document.close()
  assert.equal(
    extractWebsite(
      {
        document,
        pageUrl: "https://acme.example/about",
        capturedAt: "2026-07-12T00:00:00.000Z",
      },
      "website",
    ).length,
    0,
  )
}

document.open()
document.write(`<!doctype html>
  <head>
    <meta property="og:type" content="profile">
    <meta property="business:contact_data:category" content="Public Figure">
    <script type="application/ld+json">{"@type":"Person","name":"Alice Doe"}</script>
  </head>
  <main><h1>Alice Doe</h1><a href="mailto:alice.personal@example.com">Email</a></main>`)
document.close()
assert.equal(
  extractWebsite(
    {
      document,
      pageUrl: "https://www.instagram.com/alice/",
      capturedAt: "2026-07-12T00:00:00.000Z",
    },
    "social",
  ).length,
  0,
)

for (const scripts of [
  `<script type="application/ld+json">${JSON.stringify({
    "@type": "Person",
    name: "Alice Doe",
    padding: "x".repeat(100_100),
  })}</script>`,
  `${Array.from(
    { length: 20 },
    () => '<script type="application/ld+json">{"@type":"Thing"}</script>',
  ).join(
    "",
  )}<script type="application/ld+json">{"@type":"Person","name":"Alice Doe"}</script>`,
]) {
  document.open()
  document.write(`<!doctype html>
    <head>
      <meta property="business:contact_data:category" content="Consultant">
      ${scripts}
    </head>
    <main><h1>Alice Doe</h1><p>alice.personal@example.com</p></main>`)
  document.close()
  assert.equal(
    extractWebsite(
      {
        document,
        pageUrl: "https://www.instagram.com/alice/",
        capturedAt: "2026-07-12T00:00:00.000Z",
      },
      "social",
    ).length,
    0,
  )
}

document.open()
document.write(`<!doctype html>
  <head>
    <meta property="business:contact_data:category" content="Consultant">
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Person", name: "Alice Doe" },
        ...Array.from({ length: 10_001 }, () => ({})),
      ],
    })}</script>
  </head>
  <main><h1>Alice Doe</h1><p>alice.personal@example.com</p></main>`)
document.close()
assert.equal(
  extractWebsite(
    {
      document,
      pageUrl: "https://www.instagram.com/alice/",
      capturedAt: "2026-07-12T00:00:00.000Z",
    },
    "social",
  ).length,
  0,
)

document.open()
document.write(`<!doctype html>
  <head>
    <meta property="business:contact_data:category" content="Coffee roaster">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":["https://schema.org/Thing]Label","https://schema.org/Person"],"name":"Alice Doe"}</script>
  </head>
  <main><h1>Alice Doe</h1><a href="mailto:alice.personal@example.com">Email</a></main>`)
document.close()
assert.equal(
  extractWebsite(
    {
      document,
      pageUrl: "https://www.instagram.com/alice/",
      capturedAt: "2026-07-12T00:00:00.000Z",
    },
    "social",
  ).length,
  0,
)

document.open()
document.write(`<!doctype html>
  <head>
    <meta property="business:contact_data:category" content="Consultant">
    <script type="application/ld+json">{"@context":{"kind":"@type","Human":"https://schema.org/Person"},"kind":"Human","name":"Alice Doe"}</script>
  </head>
  <main><h1>Alice Doe</h1><p>alice.personal@example.com</p></main>`)
document.close()
assert.equal(
  extractWebsite(
    {
      document,
      pageUrl: "https://www.instagram.com/alice/",
      capturedAt: "2026-07-12T00:00:00.000Z",
    },
    "social",
  ).length,
  0,
)

for (const [heading, graph, expected] of [
  [
    "Alice Doe",
    [
      { "@type": "WebPage", name: "Alice Doe" },
      { "@type": "Organization", name: "Acme" },
    ],
    0,
  ],
  [
    "Acme",
    [
      { "@type": "WebSite", name: "Acme Website" },
      { "@type": ["Thing", "https://schema.org/Organization"], name: "Acme" },
    ],
    1,
  ],
  [
    "Alice Doe",
    [
      {
        "@context": { Human: "https://schema.org/Organization" },
        "@type": "Thing",
      },
      { "@type": "Human", name: "Alice Doe" },
    ],
    0,
  ],
] as const) {
  document.open()
  document.write(`<!doctype html>
    <head><script type="application/ld+json">${JSON.stringify({ "@graph": graph })}</script></head>
    <main><h1>${heading}</h1><p>hello@acme.example</p></main>`)
  document.close()
  assert.equal(
    extractWebsite(
      {
        document,
        pageUrl: "https://acme.example/about",
        capturedAt: "2026-07-12T00:00:00.000Z",
      },
      "website",
    ).length,
    expected,
  )
}

for (const control of [
  "<button>Logout</button>",
  '<button aria-label="Sign out"></button>',
  '<a href="/account">My account</a>',
  '<button aria-label="User menu"></button><a href="/dashboard">Dashboard</a>',
  '<button aria-label="Account"></button><a href="/profile">Profile</a>',
  '<form><button formaction="/dashboard">Continue</button></form>',
  '<form><input type="submit" formaction="/profile" value="Save"></form>',
  '<a href="/my-account" aria-label="Open private area"></a>',
  '<a href="/wp-admin" aria-label="Open private area"></a>',
]) {
  document.open()
  document.write(`<!doctype html>
    <head><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script></head>
    <body>${control}<main><h1>Acme</h1><p>victim@example.com +1 202 555 0199</p></main></body>`)
  document.close()
  assert.equal(
    extractWebsite(
      {
        document,
        pageUrl: "https://acme.example/",
        capturedAt: "2026-07-12T00:00:00.000Z",
      },
      "website",
    ).length,
    0,
  )
}

for (const publicNavigation of [
  '<a href="/team">Meet our team</a>',
  '<a href="/services">Accounting services</a>',
  '<a href="/about">Company profile</a>',
  '<a href="/login">Log in</a>',
  '<a href="/app">Launch app</a>',
  '<a href="/customer-portal">Customer portal</a>',
]) {
  document.open()
  document.write(`<!doctype html>
    <head><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script></head>
    <body>${publicNavigation}<main><h1>Acme</h1><p>hello@acme.example</p></main></body>`)
  document.close()
  assert.equal(
    extractWebsite(
      {
        document,
        pageUrl: "https://acme.example/",
        capturedAt: "2026-07-12T00:00:00.000Z",
      },
      "website",
    ).length,
    1,
  )
}

for (const path of ["", "contact"]) {
  document.open()
  document.write(`<!doctype html>
    <head><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script></head>
    <body>
      <nav>Signed in as Owner <a href="/logout">Sign out</a></nav>
      <main><h1>Acme</h1><p>victim@example.com +1 202 555 0199</p></main>
    </body>`)
  document.close()
  assert.equal(
    extractWebsite(
      {
        document,
        pageUrl: `https://acme.example/${path}`,
        capturedAt: "2026-07-12T00:00:00.000Z",
      },
      "website",
    ).length,
    0,
  )
}

const maps = extractMaps(
  await fixture(
    "google-maps.html",
    "https://www.google.com/maps/search/plumbers",
  ),
)
assert.equal(maps.length, 2)
assert.equal(maps[0]?.website, "https://northstar.example/")
assert.equal(maps[0]?.address, "14 North Street")
assert.deepEqual(maps[1]?.phones, ["+91 91234 56789"])
assert.equal(
  maps[0]?.evidence.some((item) => item.field === "website"),
  true,
)

const instagramContext = await fixture(
  "instagram-business.html",
  "https://www.instagram.com/northstarcoffee/",
)
assert.equal(detectSourceType(instagramContext.pageUrl), "social")
const instagram = extractWebsite(instagramContext, "social")
assert.equal(instagram.length, 1)
assert.equal(instagram[0]?.name, "Northstar Coffee (@northstarcoffee)")
assert.deepEqual(instagram[0]?.emails, ["hello@northstar.example"])
assert.equal(instagram[0]?.emails.includes("private@example.com"), false)
assert.equal(
  instagram[0]?.socialProfiles.includes(
    "https://www.instagram.com/direct/inbox/",
  ),
  false,
)

assert.equal(
  detectSourceType("https://www.google.co.in/maps/search/coffee"),
  "google-maps",
)
assert.equal(
  detectSourceType("https://www.google.co.uk/search?q=coffee"),
  "google-search",
)
assert.equal(detectSourceType("https://maps.google.com/"), "google-maps")

const linkedinContext = await fixture(
  "linkedin-company.html",
  "https://www.linkedin.com/company/northstar-coffee/about/",
)
const linkedin = extractWebsite(linkedinContext, "social")
assert.equal(linkedin.length, 1)
assert.equal(linkedin[0]?.tags.includes("public-business-profile"), true)
assert.deepEqual(linkedin[0]?.emails, ["hello@northstar.example"])

document.open()
document.write(
  '<!doctype html><main><h1>Jane Doe</h1><a href="mailto:private.person@example.com">Email</a></main>',
)
document.close()
assert.equal(
  extractWebsite(
    {
      document,
      pageUrl: "https://www.instagram.com/jane_doe/",
      capturedAt: "2026-07-12T00:00:00.000Z",
    },
    "social",
  ).length,
  0,
)

const mapsDetail = extractMaps(
  await fixture(
    "google-maps-detail.html",
    "https://www.google.com/maps/place/Northstar+Coffee",
  ),
)
assert.equal(mapsDetail.length, 1)
assert.equal(mapsDetail[0]?.name, "Northstar Coffee")
assert.equal(mapsDetail[0]?.category, "Coffee roaster")
assert.equal(mapsDetail[0]?.address, "14 North Street, Pune")
assert.deepEqual(mapsDetail[0]?.phones, ["+91 98765 43210"])
assert.equal(mapsDetail[0]?.website, "https://northstar.example/")
assert.equal(mapsDetail[0]?.emails.includes("private@example.com"), false)

GlobalRegistrator.unregister()
process.stdout.write("6 extractor fixtures passed\n")
