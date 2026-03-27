# Daytona OpenCode Agent Snapshot

Builds a Daytona snapshot with:

- a pre-initialized Nango project under `/home/daytona/nango-integrations`
- the `nango` CLI installed globally
- the `opencode-ai` CLI installed globally

The image runs `nango init . --copy`, removes the scaffolded example integration files, replaces `index.ts` with an empty module, and installs the project dependencies.
