# E2B OpenCode Agent Template

Build this template with:

```bash
npx tsx packages/e2b-opencode-agent/build.ts
```

The template is built with `4` vCPUs and `2048 MB` RAM.

It creates an E2B template alias that contains:

- a pre-initialized Nango project at `/home/user/nango-integrations`
- `nango` installed globally
- `opencode-ai` installed globally
- the vendored `nango-remote-function-builder` skill under `.agents/skills`
- `openssh-server` and `websocat` for SSH debugging over port `8081`

The runtime starts `opencode serve` after sandbox creation so it can pick up sandbox-specific environment variables like `OPENCODE_API_KEY`.

SSH from your laptop with:

```bash
ssh -o 'ProxyCommand=websocat --binary -B 65536 - wss://8081-%h.e2b.app' user@<sandbox-id>
```
