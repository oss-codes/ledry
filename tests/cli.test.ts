import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AppConfig } from "../src/config"
import type { Lead } from "../src/schemas"
import { type BridgeServer, startBridgeServer } from "../src/server"
import { LeadStore } from "../src/store"

const directories: string[] = []
const servers: BridgeServer[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.stop()
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true })
})

const lead = {
  id: "cli_lead",
  name: "CLI Coffee",
  organization: "CLI Coffee",
  category: "Coffee roaster",
  website: "https://cli-coffee.example",
  emails: [],
  phones: [],
  socialProfiles: [],
  address: "Pune",
  sourceUrl: "https://cli-coffee.example",
  sourceType: "website",
  capturedAt: "2026-07-13T08:30:00.000Z",
  evidence: [],
  confidence: 0.8,
  score: 72,
  tags: [],
} satisfies Lead

async function runCli(home: string, args: readonly string[]) {
  const process = Bun.spawn(["bun", "run", "src/cli.tsx", ...args], {
    cwd: join(import.meta.dir, ".."),
    env: { ...globalThis.process.env, HOME: home },
    stderr: "pipe",
    stdout: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  return { exitCode, stderr, stdout }
}

describe("CLI command wiring", () => {
  test("keeps lead export and qualification as separate actions", async () => {
    const home = mkdtempSync(join(tmpdir(), "ledry-"))
    directories.push(home)
    const dataDirectory = join(home, ".ledry")
    mkdirSync(dataDirectory, { recursive: true })
    const config = {
      token: "test_token_1234567890",
      port: 0,
    } satisfies AppConfig
    const store = new LeadStore(join(dataDirectory, "leads.sqlite"))
    store.save([lead])
    const server = startBridgeServer(config, store)
    servers.push(server)
    await Bun.write(
      join(dataDirectory, "config.json"),
      JSON.stringify({ ...config, port: server.port }),
    )

    const qualified = await runCli(home, [
      "qualify",
      "--id",
      lead.id,
      "--status",
      "qualified",
    ])
    expect(qualified.exitCode).toBe(0)
    expect(JSON.parse(qualified.stdout).qualificationStatus).toBe("qualified")

    const exported = await runCli(home, ["leads", "--format", "json"])
    expect(exported.exitCode).toBe(0)
    expect(JSON.parse(exported.stdout)[0]?.id).toBe(lead.id)
    expect(exported.stderr).toBe("")
  })
})
