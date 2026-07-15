import { expect, test } from "bun:test"

test("browser extractors pass website, Google Search, and Google Maps fixtures", async () => {
  const process = Bun.spawn(
    ["bun", "run", `${import.meta.dir}/../scripts/check-extractors.ts`],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  expect(stderr).toBe("")
  expect(exitCode).toBe(0)
  expect(stdout).toContain("6 extractor fixtures passed")
})
