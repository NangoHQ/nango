# Daytona SF Compiler Snapshot

Builds a Daytona snapshot with a pre-initialized Nango project under `/home/daytona/nango-integrations` and the `nango` CLI installed globally.

Because `daytonaio/sandbox:0.6.0` already includes `opencode-ai`, this image explicitly removes it so the compiler snapshot stays OpenCode-free.

The image runs `nango init . --copy`, removes the scaffolded example integration files, replaces `index.ts` with an empty module, and installs the project dependencies.
