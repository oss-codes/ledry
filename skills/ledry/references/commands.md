# Command contracts

## Connection

```bash
ledry pair
ledry serve
ledry dashboard
ledry dashboard --no-open
ledry doctor
```

`pair` prints local extension configuration, including a secret. It is a user-only command: an agent must ask the user to run it in a separate terminal and must not invoke or capture it. `serve` runs the loopback daemon. `doctor` exits `0` when both daemon and extension are ready and `2` when the daemon is ready but the extension is offline.

`dashboard` starts the same daemon and opens the human review workspace. `--no-open` prints the localhost URL without launching a browser, which is better for managed agent terminals.

## Browser tabs

```bash
ledry tabs --json
```

Returns an array of `{ id, title, url }`. Use the numeric `id` only for the current daemon session.

## Approved-tab control

```bash
ledry navigate --tab 123 --url "https://www.google.com/search?q=coffee+roasters+pune"
ledry scroll --tab 123 --amount 1200
```

`navigate` reuses a tab the user already approved from the extension toolbar, but only within that tab's approved origin. Chrome revokes temporary access when the origin changes, so the user must open and approve each new origin. It accepts public HTTP(S) destinations, rejects LinkedIn, and rejects cross-origin transitions. `scroll` accepts 100-3000 pixels. Both commands keep browser activity visible to the user.

## Extraction

```bash
ledry scrape --tab 123 --source google-maps
ledry scrape --tab 123 --source google-search
ledry scrape --tab 123 --source website
ledry scrape --tab 123 --source social
```

Extraction saves normalized leads and returns `{ saved, leads }`. Each lead contains source provenance and field evidence. The extension rejects LinkedIn tabs.

## Review and export

```bash
ledry leads --format json
ledry leads --format jsonl --out leads.jsonl
ledry leads --format csv --out leads.csv
```

Use JSON for inspection, JSONL for agent/data pipelines, and CSV for spreadsheet handoff.

## Qualification

```bash
ledry records --format json
ledry qualify --id lead_123 --status qualified
ledry qualify --id lead_123 --status not-qualified
ledry qualify --id lead_123 --status found
ledry records --format csv --out reviewed-leads.csv
```

`records` includes each normalized lead plus its persisted `qualificationStatus`. `qualify` changes only that status. Agents must preserve `found` when user-defined criteria cannot be resolved from captured evidence.
