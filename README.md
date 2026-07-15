# Ledry

An open-source, local-first lead research agent. It connects an OpenTUI terminal application to a small Chrome extension so AI agents can research Google Maps, Google Search, public business websites, Instagram, and LinkedIn organization pages through the browser session you already control.

The project deliberately does not support personal profiles, private or account-scoped pages, CAPTCHA bypass, proxy rotation, private data collection, or automated outreach.

## Why this exists

Most lead scrapers are closed dashboards or single-site CSV exporters. Ledry makes the browser bridge, source adapters, normalized lead schema, evidence, and AI instructions open and inspectable.

## Current MVP

- Authenticated loopback WebSocket bridge
- Manifest V3 Chrome extension with visible connection badge
- Google Maps business extraction
- Google Search result extraction
- Public website email/phone extraction and verified LinkedIn organization links
- Dynamic source detection with specialized Google and public-social adapters
- Durable research run reports with immutable record snapshots and verified exports
- SQLite persistence and stable source-URL upserts
- OpenTUI dashboard for tabs and captured leads
- Responsive localhost dashboard for source selection, review, evidence, and qualification
- Shared `found`, `qualified`, and `not-qualified` state across browser, CLI, and TUI
- JSON, JSONL, and CSV export
- Portable Agent Skill for Claude Code, Codex, OpenCode, and Hermes

## Install from source

Requirements: [Bun](https://bun.sh) 1.3 or newer and Chrome 116 or newer.

```bash
git clone https://github.com/oss-codes/ledry.git
cd ledry
bun install
bun run build
bun link
ledry pair
```

Open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose the printed `extension` directory. Paste the port and token shown by `ledry pair` into the extension options page. Open Google Maps or another public source, click the Ledry toolbar icon, choose the exact tab, and select **Allow selected tab**. After Chrome grants that origin, select **Open Ledry**. The CLI cannot see or extract unapproved tabs.

Start the interactive application:

```bash
ledry
```

Or start the browser workspace for a nontechnical operator:

```bash
ledry dashboard
```

The command opens a loopback-only dashboard. It shows extension connectivity, approved source tabs, captured evidence, lead scores, and persisted qualification status. Use `ledry dashboard --no-open` when an AI agent or process manager should keep the daemon alive without launching a browser.

Or use the agent-friendly commands:

```bash
ledry serve
ledry doctor
ledry tabs --json
ledry navigate --tab 123 --url "https://www.google.com/search?q=coffee+roasters+pune"
ledry scroll --tab 123 --amount 1200
ledry scrape --tab 123 --source google-maps
ledry scrape --tab 123 --source google-search
ledry research --tab 123 --source auto --limit 5 --brief "Coffee roasters in Pune" --out pune-coffee.csv
ledry report --run latest
ledry export --run latest --format csv --out verified-leads.csv
ledry leads --format csv --out leads.csv
ledry records --format json
ledry qualify --id lead_123 --status qualified
```

`ledry tabs --json` marks the tab chosen in the extension picker with `"selected": true`, so Claude Code, Codex, OpenCode, and other shell-capable agents can follow the user's intended source without guessing.

Navigation stays within the tab's user-approved origin. Open and approve a tab again before an agent works on a different origin. LinkedIn is limited to public company and school pages; profiles, feeds, messages, account pages, analytics, and settings remain blocked. Generic websites and social pages are persisted only when the page exposes explicit organization or business-page evidence; ambiguous personal pages fail closed.

An agent workflow is intentionally shell-based and vendor-neutral: start the dashboard daemon, reuse a user-approved tab for visible navigation and scrolling, scrape within the user's scope, inspect `records`, and apply only user-provided qualification criteria with `qualify`. Claude Code, Codex, OpenCode, Hermes, and other agents that can follow an Agent Skill and invoke local commands use the same contract. Pairing remains user-only because it prints the local secret.

## Install the Agent Skill

The canonical skill lives at `skills/ledry/SKILL.md` and follows the open Agent Skills format.

- Claude Code: copy `skills/ledry` to `.claude/skills/ledry` or `~/.claude/skills/ledry`.
- Codex: copy it to `.agents/skills/ledry` in a project or `~/.agents/skills/ledry` globally.
- OpenCode: copy it to `.opencode/skills/ledry`, `.claude/skills/ledry`, or `.agents/skills/ledry`.
- Hermes: run `hermes skills install oss-codes/ledry/skills/ledry`.

The format and install locations are documented by [Claude Code](https://code.claude.com/docs/en/skills), [Codex](https://learn.chatgpt.com/docs/build-skills), [OpenCode](https://opencode.ai/docs/skills), and [Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills).

## Security model

- The daemon binds only to `127.0.0.1`.
- The dashboard uses an HttpOnly same-site session cookie; state-changing browser requests must be same-origin.
- Extension connections require a generated local token.
- Browser session cookies are never sent to the CLI.
- The `tabs` permission populates the user-invoked tab picker with titles and URLs; page reads and browser control still require separately granted per-origin HTTP(S) access.
- Chrome access is otherwise limited to the active tab, the side panel, scripting, storage, and the exact HTTP(S) origins the user approves.
- The extension rejects personal/private social routes and only permits public LinkedIn organization pages.
- Unsafe candidates are counted with a reason and source type, but their names and contact details are not retained in quarantine.
- Lead fields retain source URLs and field-level evidence.

The extension can read approved pages. Review the source before installing it, keep the pairing token private, and stop the daemon when not in use. See [SECURITY.md](SECURITY.md) for reports.

## Development

```bash
bun run typecheck
bun run check
bun test
bun run build
bun run skill:validate
```

## Project status

This is an early MVP. Google frequently changes Maps markup, so extraction adapters are expected to evolve. Contributions should include an anonymized fixture or focused test for adapter changes.

## License

MIT
