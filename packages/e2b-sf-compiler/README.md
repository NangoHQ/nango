# E2B SF Compiler Template

Build this template with:

```bash
npx tsx packages/e2b-sf-compiler/build.ts
```

It creates an E2B template alias that contains a pre-initialized Nango project at `/home/user/nango-integrations` with the `nango` CLI installed globally.

It also enables SSH debugging over port `8081`.

```bash
ssh -o 'ProxyCommand=websocat --binary -B 65536 - wss://8081-%h.e2b.app' user@<sandbox-id>
```
