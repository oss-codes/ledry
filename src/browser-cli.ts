import { type Command, Option } from "commander"
import { z } from "zod"
import { DaemonClient } from "./client"
import { loadConfig } from "./config"
import { SourceTypeSchema } from "./schemas"

const TabIdSchema = z.coerce.number().int().nonnegative()
const ScrollAmountSchema = z.coerce.number().int().min(100).max(3000)

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
          : `${tabs.map((tab) => `${tab.id}\t${tab.title}\t${tab.url}`).join("\n")}\n`,
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
    .command("scrape")
    .description("Extract leads from an approved browser tab")
    .requiredOption("--tab <id>", "Chrome tab ID")
    .addOption(
      new Option("--source <type>", "Source adapter")
        .choices(["google-maps", "google-search", "website", "social"])
        .default("website"),
    )
    .action(
      async (options: { readonly tab: string; readonly source: string }) => {
        const leads = await new DaemonClient(await loadConfig()).extract(
          TabIdSchema.parse(options.tab),
          SourceTypeSchema.parse(options.source),
        )
        process.stdout.write(
          `${JSON.stringify({ saved: leads.length, leads }, null, 2)}\n`,
        )
      },
    )
}
