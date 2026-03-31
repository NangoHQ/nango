---
name: operating-daytona-cli
description: Use when creating Daytona snapshots or sandboxes from the CLI, debugging snapshot build failures, or wiring preview access - provides stable command patterns, known CLI quirks, verification steps, and links to the most relevant Daytona docs
---

# Operating Daytona CLI

## Overview

Daytona CLI works well for snapshot and sandbox workflows, but a few behaviors are easy to misread: snapshot creation can succeed even when the CLI stream errors, local image pushes require `linux/amd64`, and parallel snapshot builds can collide locally.

## When to Use

- Creating or verifying Daytona snapshots from Dockerfiles or local images
- Spawning sandboxes from named snapshots and checking their contents
- Debugging `no profiles found`, `INTERNAL_ERROR`, `context.tar`, or architecture mismatch failures
- Fetching preview URLs and deciding between signed vs standard preview auth

Do not use this skill for Daytona SDK design; use the official SDK docs directly for code-level API shapes.

## Quick Reference

| Task | Command | Notes |
|---|---|---|
| Check CLI version | `daytona --version` | Upgrade if CLI/API versions differ |
| Log in | `daytona login --api-key=...` | Required before snapshot/sandbox operations |
| List snapshots | `daytona snapshot list` | Use this to confirm real state after flaky builds |
| Create snapshot from Dockerfile | `daytona snapshot create <name> --dockerfile path --context path` | Run sequentially, not in parallel |
| Push local image | `daytona snapshot push image:tag --name <name>` | Local image must be `linux/amd64` |
| Create sandbox from snapshot | `daytona sandbox create --snapshot <name> --name <sandbox>` | Main verification step |
| Run command in sandbox | `daytona sandbox exec <sandbox> -- sh -lc '...'` | Good for smoke tests |
| Get signed preview URL | `daytona preview-url <sandbox> --port 3000 --expires 3600` | No extra header needed |

## Proven Workflow

1. Run Daytona CLI commands from the same authenticated shell session.
2. Prefer `daytona snapshot create ... --dockerfile ... --context ...` from repo root.
3. Never run multiple `daytona snapshot create` commands in parallel from the same checkout.
4. After snapshot creation, always verify with both:
   - `daytona snapshot list`
   - `daytona sandbox create --snapshot ...`
5. Inside the sandbox, verify the exact tools and files you expect with `daytona sandbox exec`.

## Known CLI Findings

### 1. Parallel snapshot creation is flaky

Observed failure:

```text
failed to remove tar file: remove context.tar: no such file or directory
```

Interpretation:

- Daytona CLI appears to use a shared local tarball during `snapshot create`
- two concurrent `snapshot create` calls from the same checkout can race

Rule:

- run snapshot creation sequentially

### 2. Snapshot builds can finish even when the CLI stream errors

Observed failure:

```text
Error reading from stream: stream error: stream ID ... INTERNAL_ERROR
```

Interpretation:

- the CLI log stream can die after the remote build completed
- do not trust the process exit alone

Rule:

- check `daytona snapshot list`
- then create a sandbox from the snapshot to verify it is actually usable

### 3. Local image pushes require AMD64

Official docs confirm Daytona expects local images used with `daytona snapshot push` to be built for `linux/amd64`.

Rule:

```bash
docker buildx build --platform linux/amd64 -t my-image:tag .
daytona snapshot push my-image:tag --name my-snapshot
```

### 4. Daytona base snapshots already include tools

Official snapshots docs list `opencode-ai` in the default Node package set for `daytonaio/sandbox`-based snapshots.

Rule:

- if you need a compiler-only image, explicitly remove `opencode-ai`
- if you need an agent image, you may still reinstall or pin it explicitly for reproducibility

### 5. Authentication can appear context-sensitive

Observed behavior:

- some `daytona snapshot create` runs from nested package directories returned `no profiles found`
- the same commands worked from repo root in the same environment

Rule:

- prefer running Daytona CLI commands from repo root or another known-good authenticated shell context
- if behavior looks wrong, re-run from repo root before assuming auth is broken

### 6. CLI/API version mismatch is noisy and worth fixing

Observed warning:

```text
Version mismatch: Daytona CLI is on vX and API is on vY
```

Rule:

```bash
brew upgrade daytonaio/cli/daytona
```

Small mismatches may still work, but they make debugging harder.

## Verification Pattern

Use this after every snapshot build:

```bash
daytona snapshot list
daytona sandbox create --snapshot my-snapshot --name verify-my-snapshot --auto-stop 0 --auto-delete 0
daytona sandbox exec verify-my-snapshot -- sh -lc 'command -v nango && test -d /home/daytona/nango-integrations'
daytona sandbox delete verify-my-snapshot
```

For this repo, good verification examples are:

- compiler snapshot: `nango` present, `opencode` absent, `/home/daytona/nango-integrations` exists
- agent snapshot: both `nango` and `opencode` present, `/home/daytona/nango-integrations` exists

## Preview URL Notes

- Standard preview URLs require the `x-daytona-preview-token` header
- signed preview URLs embed the token directly in the URL
- standard preview tokens reset on sandbox restart
- signed preview URLs are better when the caller cannot control headers
- preview/browser flows may show Daytona's warning page unless skipped by header or custom proxy

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Running snapshot builds in parallel | `context.tar` or random snapshot-create failures | Build snapshots sequentially |
| Trusting the CLI exit alone | Build looks failed even though snapshot exists | Check `daytona snapshot list` and boot a sandbox |
| Using an arm64-only local image | `snapshot push` architecture error | Build local image with `--platform linux/amd64` |
| Assuming base image is empty | Unexpected tools like `opencode` already installed | Inspect `daytonaio/sandbox` defaults and uninstall explicitly if needed |
| Using standard preview URL without header | 401/403 or failed preview access | Send `x-daytona-preview-token` |
| Forgetting preview tokens reset on restart | Previously working standard preview stops working | Re-fetch the standard preview URL/token |
| Debugging from the wrong directory | `no profiles found` or inconsistent CLI behavior | Re-run from repo root |

## Official Docs

- Getting started and CLI install: `https://www.daytona.io/docs/en/getting-started.md`
- CLI reference: `https://www.daytona.io/docs/en/tools/cli.md`
- Snapshots and local image requirements: `https://www.daytona.io/docs/en/snapshots.md`
- Declarative builder and pre-built snapshots: `https://www.daytona.io/docs/en/declarative-builder.md`
- Preview URLs and token behavior: `https://www.daytona.io/docs/en/preview.md`
- Custom preview proxy and reserved ports: `https://www.daytona.io/docs/en/custom-preview-proxy.md`
- API keys and scopes: `https://www.daytona.io/docs/en/api-keys.md`
- Claude/CLI sandbox guide: `https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox.md`
