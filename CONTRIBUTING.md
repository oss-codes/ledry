# Contributing

Thank you for improving Ledry.

1. Open an issue describing the source, fields, and user-visible workflow.
2. Keep extraction adapters source-specific and preserve field-level provenance.
3. Keep LinkedIn limited to public company and school pages. Do not add personal-profile collection, CAPTCHA bypass, proxy evasion, private-data extraction, or automated outreach.
4. Add an anonymized fixture or focused test for extraction changes.
5. Run `bun run typecheck`, `bun run check`, `bun test`, `bun run build`, and `bun run skill:validate`.

Keep changes small and avoid unrelated refactors. Never commit real lead data, cookies, tokens, or browser profiles.
