import { type Command, Option } from "commander"
import { z } from "zod"
import { DaemonClient } from "./client"
import { loadConfig } from "./config"
import { serializeLeadRecords, writeVerifiedExport } from "./export"
import type { Tab } from "./schemas"
import { RequestedSourceSchema, SourceTypeSchema } from "./schemas"
import { sanitizeTerminalText } from "./tui-text"

const TabIdSchema = z.coerce.number().int().nonnegative()
const ScrollAmountSchema = z.coerce.number().int().min(100).max(3000)
const LeadLimitSchema = z.coerce.number().int().min(1).max(25)

export function formatBrowserTab(tab: Tab): string {
  const marker = tab.selected ? "*" : " "
  return [
    marker,
    String(tab.id),
    sanitizeTerminalText(tab.title),
    sanitizeTerminalText(tab.url),
  ].join("\t")
}

export function registerBrowserCommands(program: Command): void {
  program
    .command("tabs")
    .description("List browser tabs available to the extension")
    .option("--json", "Output JSON")
    .action(async (options: { readonly json?: boolean }) => {
      const tabs = await new DaemonClient(await loadConfig()).tabs()
      process.stdout.write(
        options.json
          ? `${JSON.stringify(tabs, null, 2)}\n`
          : `${tabs.map(formatBrowserTab).join("\n")}\n`,
      )
    })

  program
    .command("navigate")
    .description("Navigate a user-approved browser tab")
    .requiredOption("--tab <id>", "Chrome tab ID")
    .requiredOption("--url <url>", "Public HTTP(S) destination")
    .action(async (options: { readonly tab: string; readonly url: string }) => {
      const tab = await new DaemonClient(await loadConfig()).navigate(
        TabIdSchema.parse(options.tab),
        z.url().parse(options.url),
      )
      process.stdout.write(`${JSON.stringify(tab, null, 2)}\n`)
    })

  program
    .command("scroll")
    .description("Scroll a user-approved browser tab")
    .requiredOption("--tab <id>", "Chrome tab ID")
    .option("--amount <pixels>", "Pixels to scroll", "1200")
    .action(
      async (options: { readonly tab: string; readonly amount: string }) => {
        const amount = ScrollAmountSchema.parse(options.amount)
        await new DaemonClient(await loadConfig()).scroll(
          TabIdSchema.parse(options.tab),
          amount,
        )
        process.stdout.write(`${JSON.stringify({ scrolled: amount })}\n`)
      },
    )

  program
    .command("research")
    .description("Run a capped, reported lead capture on an approved tab")
    .requiredOption("--tab <id>", "Chrome tab ID")
    .option("--brief <text>", "Research context", "")
    .option("--limit <count>", "Maximum leads to persist", "5")
    .addOption(
      new Option("--source <type>", "Source adapter")
        .choices(["auto", "google-maps", "google-search", "website", "social"])
        .default("auto"),
    )
    .addOption(
      new Option("--format <type>", "Export format")
        .choices(["csv", "json", "jsonl"])
        .default("csv"),
    )
    .option("--out <path>", "Write this run's records to a verified file")
    .action(
      async (options: {
        readonly brief: string
        readonly format: "csv" | "json" | "jsonl"
        readonly limit: string
        readonly out?: string
        readonly source: string
        readonly tab: string
      }) => {
        const client = new DaemonClient(await loadConfig())
        const result = await client.research({
          brief: options.brief,
          limit: LeadLimitSchema.parse(options.limit),
          sourceType: RequestedSourceSchema.parse(options.source),
          tabId: TabIdSchema.parse(options.tab),
        })
        const exported =
          options.out === undefined
            ? undefined
            : await writeVerifiedExport(
                options.out,
                serializeLeadRecords(result.records, options.format),
                result.records.length,
              )
        process.stdout.write(
          `${JSON.stringify({ run: result.run, export: exported }, null, 2)}\n`,
        )
      },
    )

  program
    .command("scrape")
    .description("Extract leads from an approved browser tab")
    .requiredOption("--tab <id>", "Chrome tab ID")
    .addOption(
      new Option("--source <type>", "Source adapter")
        .choices(["auto", "google-maps", "google-search", "website", "social"])
        .default("auto"),
    )
    .action(
      async (options: { readonly tab: string; readonly source: string }) => {
        const leads = await new DaemonClient(await loadConfig()).extract(
          TabIdSchema.parse(options.tab),
          options.source === "auto"
            ? RequestedSourceSchema.parse(options.source)
            : SourceTypeSchema.parse(options.source),
        )
        process.stdout.write(
          `${JSON.stringify({ saved: leads.length, leads }, null, 2)}\n`,
        )
      },
    )
}
