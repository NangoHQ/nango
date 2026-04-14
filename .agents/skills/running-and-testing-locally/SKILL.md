---
name: running-and-testing-locally
description: Use when running the Nango application locally for development and browser testing - covers Docker services, dev commands, service URLs, and troubleshooting startup issues
---

# Running and Testing Nango Locally

## Overview

Nango runs as a set of microservices (server, webapp, jobs, persist, orchestrator, metering, connect-ui) backed by Docker containers (PostgreSQL, Redis, Elasticsearch, ActiveMQ). Two terminal sessions are needed: one for TypeScript watch-build, one for running services.

## Quick Reference

| Command | Purpose | When to use |
|---------|---------|-------------|
| `npm run dev:docker` | Start Docker deps (DB, Redis, ES, ActiveMQ) | First step, once per session |
| `npm run dev:watch` (alias `dw`) | TypeScript watch-build | Terminal 1 — always running |
| `npm run dev:watch:apps` (alias `dwa`) | Run all services | Terminal 2 — full stack |
| `npm run dev:watch:web` | Run server + webapp + connect-ui only | Terminal 2 — frontend work |
| `npm run dev:watch:headless` (alias `dwh`) | Run backend services only (no UI) | Terminal 2 — backend work |

## Service URLs

| Service | URL | Port |
|---------|-----|------|
| Webapp (dashboard) | http://localhost:3000 | 3000 |
| API Server | http://localhost:3003 | 3003 |
| Connect UI | http://localhost:3009 | 3009 |
| PostgreSQL | localhost:5432 | 5432 (user: `nango`, pass: `nango`) |
| Redis | localhost:6379 | 6379 |
| Elasticsearch | http://localhost:9500 | 9500 |
| ActiveMQ Console | http://localhost:8161 | 8161 |

## Step-by-Step Startup

```bash
# 1. Install dependencies (always after branch switch or pull)
npm install

# 2. Set up environment — check if .env exists first
#    If .env already exists, skip this step to avoid overwriting user customizations.
#    Only create it if missing.
if [ ! -f .env ]; then
  cp .env.example .env
  # Required: encryption key for persist service and Connect UI
  echo "NANGO_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env
  # Required: enable auth (login/signup UI)
  echo "FLAG_AUTH_ENABLED=true" >> .env
  # Optional: enable RBAC
  echo "FLAG_AUTH_ROLES_ENABLED=true" >> .env
fi

# 3. Start Docker containers
npm run dev:docker

# 4. Terminal 1 — watch-build TypeScript
npm run dev:watch

# 5. Terminal 2 — run all services
npm run dev:watch:apps
```

**If `.env` already exists** but is missing required settings, ensure the following are set:
- `NANGO_ENCRYPTION_KEY` — required for persist service and Connect UI (`openssl rand -base64 32` to generate)
- `FLAG_AUTH_ENABLED=true` — required for login/signup UI to appear
- `FLAG_AUTH_ROLES_ENABLED=true` — optional, enables RBAC

Wait for the TypeScript build to complete in Terminal 1 before starting services in Terminal 2. The server runs database migrations automatically on startup (`NANGO_MIGRATE_AT_START` defaults to true).

## Selective Service Commands

Run individual services when you only need to restart one:

```bash
npm run server:dev:watch       # API server only (port 3003)
npm run webapp:dev:watch       # Webapp only (port 3000)
npm run connect-ui:dev:watch   # Connect UI only (port 3009)
npm run jobs:dev:watch         # Jobs worker (port 3005)
npm run persist:dev:watch      # Persist service (port 3007)
npm run orchestrator:dev:watch # Orchestrator (port 3008)
npm run metering:dev:watch     # Metering service (cron-based, no HTTP port)
```

## Environment Configuration

The `.env` file at repo root configures local dev (copy from `.env.example` if it doesn't exist). Key settings:

```ini
SERVER_PORT=3003
NANGO_SERVER_URL=http://localhost:3003
NANGO_PUBLIC_SERVER_URL=http://localhost:3000
NANGO_PUBLIC_CONNECT_URL=http://localhost:3009
FLAG_AUTH_ENABLED=true              # Enables login/signup UI (default: false)
FLAG_AUTH_ROLES_ENABLED=true        # Enables RBAC (default: false)
FLAG_SERVE_CONNECT_UI=true          # Serve Connect UI (default: true)
NANGO_LOGS_ENABLED="false"         # Set "true" to enable ES logging
ORCHESTRATOR_SERVICE_URL="http://localhost:3008"
# NANGO_PUBSUB_TRANSPORT=activemq  # Uncomment to enable PubSub via ActiveMQ
```

`NANGO_ENCRYPTION_KEY` is **required** for the persist service and Connect UI to start (generate with `openssl rand -base64 32` and add to `.env`).

## Browser Testing Workflow

### Capturing Server Logs for Verification URLs

When testing signup/email flows, the verification URL is logged to the server output. `concurrently` (used by `dev:watch:apps`) buffers child process output, so redirecting to a file doesn't reliably capture `[srv]` lines from a non-interactive shell. Two approaches:

**Option A — Run the server separately with a Python PTY wrapper (autonomous):**
Run the server process directly with a pseudo-TTY to avoid buffering, while running other services normally. The `--watch` flag is required so the server auto-restarts when files change (without it, code changes require a manual restart):
```bash
# Server with PTY log capture
python3 -c "
import pty, os
pid, fd = pty.fork()
if pid == 0:
    os.chdir('packages/server')
    os.environ['DOTENV_CONFIG_PATH'] = './../../.env'
    os.execvp('npx', ['npx', 'tsx', '--watch', '-r', 'dotenv/config', 'lib/server.ts'])
else:
    with open('/tmp/nango-srv.log', 'wb') as f:
        while True:
            try:
                data = os.read(fd, 4096)
                if not data: break
                f.write(data); f.flush()
            except OSError: break
" &

# Other services (logs not needed)
npm run webapp:dev:watch > /dev/null 2>&1 &
npm run jobs:dev:watch > /dev/null 2>&1 &
npm run persist:dev:watch > /dev/null 2>&1 &
npm run orchestrator:dev:watch > /dev/null 2>&1 &
npm run metering:dev:watch > /dev/null 2>&1 &
npm run connect-ui:dev:watch > /dev/null 2>&1 &
```
Then grep: `grep 'signup/verification' /tmp/nango-srv.log`

**Option B — Ask the user (simpler):**
The user starts `npm run dev:watch:apps` in their own terminal. After signup, ask the user to find the verification URL in their terminal output by searching for `signup/verification`.

### Standard Test Credentials

Always use the same credentials for local dev:
- **Name:** `Test User`
- **Email:** `test@nango.dev`
- **Password:** `TestPassword123!`

### Authentication Flow

**Check the DB first** to decide whether to sign in or sign up:

```bash
docker exec nango-db psql -U nango -d nango -c "SELECT id, email, email_verified FROM _nango_users WHERE email='test@nango.dev';"
```

- **User exists + email_verified is true** → sign in at http://localhost:3000/signin
- **User exists + email_verified is false** → need to verify email first (see Sign Up step 4+)
- **No rows** → proceed to **Sign Up** below

### Sign Up (only if sign in fails)

1. Navigate to http://localhost:3000/signup
2. Fill in the signup form with the standard test credentials (Name, Email, Password). Password must contain: 8+ chars, uppercase, number, special character.
3. After submitting, the page shows a "Please verify your email" banner
4. In local dev, no email is actually sent. The server logs show the email content instead with `(EmailClient)` prefix:
   ```
   info (EmailClient) Email client not configured
   info (EmailClient) The following email would have been sent:
   info (EmailClient) test@nango.dev 'Verify your email address'
   <a href="http://localhost:3000/signup/verification/<uuid>">...</a>
   ```
5. Find the verification URL in the captured logs:
   ```bash
   grep 'signup/verification' /tmp/nango-srv.log
   ```
6. Open the verification URL (format: `http://localhost:3000/signup/verification/<uuid>`) in the browser
7. After verification, the app redirects to an **onboarding survey** ("How did you hear about Nango?") — click any option or "Skip for now" to proceed
8. You land on the **Getting Started** page / dashboard with sidebar navigation (Integrations, Connections, Logs, Metrics, Environment settings)

### General Notes

- With `FLAG_AUTH_ENABLED=true`, you'll see the login/signup page
- On a fresh/empty database, you must **sign up first** to create the initial account
- For SSO/OAuth testing, ensure `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` are configured in `.env`

### Testing Connect UI

1. Ensure `NANGO_ENCRYPTION_KEY` is set in `.env`
2. Open http://localhost:3009 directly, or trigger it from the dashboard
3. Connect UI is served by its own Vite dev server with hot reload

## Docker Container Management

```bash
# Start containers (detached)
npm run dev:docker

# Check container status
docker compose --file dev/docker-compose.dev.yaml ps

# View logs for a specific container
docker compose --file dev/docker-compose.dev.yaml logs -f nango-db

# Stop all containers
docker compose --file dev/docker-compose.dev.yaml down

# Remove named volumes (Elasticsearch, etc.) — does NOT reset the DB (bind mount)
docker compose --file dev/docker-compose.dev.yaml down -v
npm run dev:docker
# To reset the database, see "Fresh Database Reset" below
```

### Fresh Database Reset

**⚠ Always ask the user for confirmation before resetting the database.** This is a destructive operation that deletes all data (users, connections, integrations, etc.).

**Important:** The PostgreSQL container uses a bind mount (`dev/nango-data`), not a named Docker volume. `docker compose down -v` does NOT reset the database — it only removes named volumes like Elasticsearch data.

To start fresh:
1. Stop all running services (kill `dev:watch:apps` or individual service processes)
2. Drop all schemas in the database:
   ```bash
   docker exec nango-db psql -U nango -d nango -c "
     DROP SCHEMA public CASCADE;
     CREATE SCHEMA public;
     DROP SCHEMA IF EXISTS nango CASCADE;
     DROP SCHEMA IF EXISTS nango_records CASCADE;
     DROP SCHEMA IF EXISTS nango_runners CASCADE;
   "
   ```
3. Restart services — the server runs migrations automatically on startup, recreating all tables
4. You will need to sign up again (no users exist after reset)

## Product Flows

Step-by-step instructions for testing specific product features in the browser. **Teammates: please add new flows here as you discover/test them** — follow the template below.

<!--
### Flow Template
**Prerequisites:** what must be running / configured
**Steps:**
1. Step one
2. Step two
**Verify:** how to confirm it worked
-->

_No flows documented yet — add the first one!_

## Common Issues

| Issue | Symptom | Fix |
|-------|---------|-----|
| Docker not running | `Cannot connect to the Docker daemon` | Start Docker Desktop |
| Port already in use | `EADDRINUSE` on startup | Kill the process on that port: `lsof -ti:PORT \| xargs kill` |
| DB connection refused | Server crashes on startup | Check `npm run dev:docker` — wait for postgres to be ready |
| Stale TypeScript build | Runtime errors, missing modules | Stop `dev:watch`, run `npm run ts-clean && npm run ts-build`, restart |
| Webapp not loading | Blank page or 404 | Ensure `dev:watch` has finished initial build before starting `dev:watch:apps` |
| Missing node_modules | `Cannot find module` errors | Run `npm install` — required after branch switch |
| Persist crashes on startup | `NANGO_ENCRYPTION_KEY` invalid_type error | Set `NANGO_ENCRYPTION_KEY` in `.env` (`openssl rand -base64 32`) |
| Connect UI not working | 500 errors or session failures | Set `NANGO_ENCRYPTION_KEY` in `.env` |
| Can't log in on fresh DB | No account exists yet | Sign up first at http://localhost:3000/signup, then check server logs for the verification callback URL |
| Elasticsearch errors in logs | Logs-related warnings | Safe to ignore if `NANGO_LOGS_ENABLED="false"` — logs go to stdout instead |
