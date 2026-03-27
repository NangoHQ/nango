# E2B OpenCode Agent Template

Build this template with:

```bash
npx tsx packages/e2b-opencode-agent/build.ts
```

It creates an E2B template alias that contains:

- a pre-initialized Nango project at `/home/user/nango-integrations`
- `nango` installed globally
- `opencode-ai` installed globally
- the vendored `nango-remote-function-builder` skill under `.agents/skills`

The runtime starts `opencode serve` after sandbox creation so it can pick up sandbox-specific environment variables like `OPENCODE_API_KEY`.
