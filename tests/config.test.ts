import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "../src/config"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true })
})

describe("configuration security", () => {
  test("creates private token storage", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-config-"))
    directories.push(directory)
    const path = join(directory, "private", "config.json")
    await loadConfig(path)
    expect(statSync(join(directory, "private")).mode & 0o777).toBe(0o700)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  test("publishes one complete config under concurrent first use", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ledry-config-race-"))
    directories.push(directory)
    const path = join(directory, "private", "config.json")
    const configs = await Promise.all(
      Array.from({ length: 20 }, () => loadConfig(path)),
    )
    expect(new Set(configs.map((config) => config.token)).size).toBe(1)
    expect(configs.every((config) => config.port === 43110)).toBe(true)
  })
})
