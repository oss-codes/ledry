#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { Command, Option } from "commander"
import { registerBrowserCommands } from "./browser-cli"
import { DaemonClient } from "./client"
import { loadConfig } from "./config"
import { serializeLeadRecords, serializeLeads } from "./export"
import { QualificationStatusSchema } from "./schemas"
import { startBridgeServer } from "./server"
import { LeadStore } from "./store"
import { runTui } from "./tui"

const program = new Command()
  .name("ledry")
  .description("Local-first lead research through your connected browser")
  .version("0.1.0")

registerBrowserCommands(program)

function extensionPath(): string {
  const candidates = [
    join(process.cwd(), "extension"),
    join(import.meta.dir, "..", "extension"),
    join(dirname(process.execPath), "..", "extension"),
  ]
  return (
    candidates.find((candidate) =>
      existsSync(join(candidate, "manifest.json")),
    ) ?? "extension"
  )
}

function openDashboard(url: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url]
  Bun.spawn(command, { stderr: "ignore", stdout: "ignore" }).unref()
}

async function waitForShutdown(): Promise<void> {
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve)
    process.once("SIGTERM", resolve)
  })
}

program
  .command("pair")
  .description("Print extension pairing settings")
  .action(async () => {
    const config = await loadConfig()
    process.stdout.write(
      `Port: ${config.port}\nToken: ${config.token}\nExtension: ${extensionPath()}\n`,
    )
  })

program
  .command("serve")
  .description("Run the local browser bridge daemon")
  .action(async () => {
    const config = await loadConfig()
    const server = startBridgeServer(config, new LeadStore())
    process.stdout.write(
      `Ledry bridge and dashboard: http://127.0.0.1:${server.port}\n`,
    )
    await waitForShutdown()
    server.stop()
  })

program
  .command("dashboard")
  .description("Open the local browser dashboard and keep its daemon running")
  .option("--no-open", "Print the URL without opening a browser")
  .action(async (options: { readonly open: boolean }) => {
    const config = await loadConfig()
    const server = startBridgeServer(config, new LeadStore())
    const url = `http://127.0.0.1:${server.port}`
    process.stdout.write(`Ledry dashboard: ${url}\n`)
    if (options.open) openDashboard(url)
    await waitForShutdown()
    server.stop()
  })

program
  .command("doctor")
  .description("Check daemon and extension connectivity")
  .action(async () => {
    const client = new DaemonClient(await loadConfig())
    const health = await client.health()
    process.stdout.write(
      `Daemon: ${health.status}\nExtension: ${health.extensionConnected ? "connected" : "offline"}\n`,
    )
    if (!health.extensionConnected) process.exitCode = 2
  })

program
  .command("leads")
  .description("Print or export captured leads")
  .addOption(
    new Option("--format <type>", "Output format")
      .choices(["csv", "json", "jsonl"])
      .default("json"),
  )
  .option("--out <path>", "Write output to a file")
  .action(
    async (options: {
      readonly format: "csv" | "json" | "jsonl"
      readonly out?: string
    }) => {
      const output = serializeLeads(
        await new DaemonClient(await loadConfig()).leads(),
        options.format,
      )
      if (options.out === undefined) process.stdout.write(output)
      else await Bun.write(options.out, output)
    },
  )

program
  .command("records")
  .description("Print or export leads with qualification status")
  .addOption(
    new Option("--format <type>", "Output format")
      .choices(["csv", "json", "jsonl"])
      .default("json"),
  )
  .option("--out <path>", "Write output to a file")
  .action(
    async (options: {
      readonly format: "csv" | "json" | "jsonl"
      readonly out?: string
    }) => {
      const output = serializeLeadRecords(
        await new DaemonClient(await loadConfig()).records(),
        options.format,
      )
      if (options.out === undefined) process.stdout.write(output)
      else await Bun.write(options.out, output)
    },
  )

program
  .command("qualify")
  .description("Set a saved lead qualification status")
  .requiredOption("--id <id>", "Stable lead ID")
  .addOption(
    new Option("--status <status>", "Qualification status")
      .choices(["found", "qualified", "not-qualified"])
      .makeOptionMandatory(),
  )
  .action(async (options: { readonly id: string; readonly status: string }) => {
    const status = QualificationStatusSchema.parse(options.status)
    const record = await new DaemonClient(await loadConfig()).qualify(
      options.id,
      status,
    )
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`)
  })

program
  .command("tui")
  .description("Open the interactive OpenTUI dashboard")
  .action(async () => {
    const config = await loadConfig()
    const server = startBridgeServer(config, new LeadStore())
    await runTui(config, server)
  })

async function main(): Promise<void> {
  try {
    const argv =
      process.argv.length === 2 ? [...process.argv, "tui"] : process.argv
    await program.parseAsync(argv)
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Unexpected failure"}\n`,
    )
    process.exitCode = 1
  }
}

await main()
