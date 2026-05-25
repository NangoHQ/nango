---
name: ui-visual-debugging
description: Use when modifying or visually debugging Nango frontend UI, including packages/webapp, packages/connect-ui, browser interactions, screenshots, responsive layout, and visual regressions. Prefer browser-controlled or headless Playwright checks; use Peekaboo only for native macOS, visible-browser, or Accessibility tree inspection.
---

# UI Visual Debugging

## Core Rules

- Use a browser-controlled or headless context for routine web UI checks. Do not open tabs in the user's existing browser unless explicitly asked.
- Save screenshots, traces, and throwaway Playwright scripts under `.context/`; do not commit them.
- Use Peekaboo only when the task needs the real macOS desktop, native windows, a visible browser session, or Accessibility tree inspection.
- For local startup details, use `running-and-testing-locally` as the source of truth.

## Nango Targets

| Surface | URL | Common command |
| --- | --- | --- |
| Dashboard webapp | `http://localhost:3000` | `npm run dev:watch:web` |
| API server | `http://localhost:3003` | `npm run server:dev:watch` |
| Connect UI | `http://localhost:3009` | `npm run dev:watch:web` or `npm run connect-ui:dev:watch` |

For most frontend work, run:

```bash
npm run dev:docker
npm run dev:watch
npm run dev:watch:web
```

`npm run dev:watch` and `npm run dev:watch:web` are long-running commands. Keep them in separate sessions and wait for the initial TypeScript build before browser testing.

## Standard Screenshot Workflow

1. Start or reuse the relevant local services.

2. Capture desktop and mobile baselines with a browser-controlled tool. If a Playwright MCP/browser tool is available, use it. Otherwise use headless Playwright without modifying repo dependencies:

   ```bash
   npx playwright screenshot --browser=chromium --viewport-size=1512,862 http://localhost:3000 .context/nango-webapp-desktop.png
   npx playwright screenshot --browser=chromium --viewport-size=390,844 http://localhost:3000 .context/nango-webapp-mobile.png
   ```

   For Connect UI:

   ```bash
   npx playwright screenshot --browser=chromium --viewport-size=1512,862 http://localhost:3009 .context/nango-connect-desktop.png
   npx playwright screenshot --browser=chromium --viewport-size=390,844 http://localhost:3009 .context/nango-connect-mobile.png
   ```

   If Playwright reports that the Chromium executable is missing, install the browser cache without adding repo dependencies:

   ```bash
   npx playwright install chromium
   ```

3. Inspect screenshots with `view_image`, then edit the smallest relevant files.

4. Verify after edits:

   ```bash
   npm run ts-build
   ```

   For webapp-only visual work, `cd packages/webapp && npm run build` is also useful. For Connect UI, run `npm run connect-ui:build`.

5. Capture fresh desktop and mobile screenshots and compare them before finishing.

## Headless Interaction

For clicks, form filling, authentication flows, or multi-step checks, create a temporary Playwright script in `.context/`, run it, and save screenshots there.

Use stable selectors and visible text where possible. Avoid relying on the user's browser state.

Common flows:
- Dashboard sign-in/sign-up at `http://localhost:3000`.
- Dashboard pages after authentication: Integrations, Connections, Logs, Metrics, and Environment settings.
- Connect UI at `http://localhost:3009`.

When auth is needed, follow the local credentials and verification-log workflow in `running-and-testing-locally`.

## Startup Troubleshooting

If server startup fails with a Knex error like `The migration directory is corrupt, the following files are missing`, the local database has migrations from another branch. Do not reset the user's database without confirmation. For visual validation only, use a temporary database:

```bash
docker exec nango-db psql -U nango -d postgres -c "DROP DATABASE IF EXISTS nango_ui_skill_validation WITH (FORCE)"
docker exec nango-db psql -U nango -d postgres -c "CREATE DATABASE nango_ui_skill_validation"
NANGO_DB_NAME=nango_ui_skill_validation npm run dev:watch:web
```

After stopping the dev server, clean up the temporary database:

```bash
docker exec nango-db psql -U nango -d postgres -c "DROP DATABASE IF EXISTS nango_ui_skill_validation WITH (FORCE)"
```

## Peekaboo Workflow

Use Peekaboo only after checking permissions:

```bash
peekaboo permissions status
```

Required:

```text
Screen Recording (Required): Granted
Accessibility (Required): Granted
```

Prefer targeted captures by window id. Capturing by app name can hang.

```bash
peekaboo list windows --app "Google Chrome" --json
peekaboo image --mode window --window-id <window_id> --retina --path .context/nango-window.png --json-output
peekaboo see --app "Google Chrome" --json-output
```

Avoid `peekaboo open http://... --app "Google Chrome"` for routine checks because it creates tabs in the user's existing browser.

## Review Checklist

- [ ] Baseline screenshot captured before UI edits when layout risk is meaningful.
- [ ] Desktop and mobile screenshots captured after edits.
- [ ] Screenshots, traces, and throwaway scripts stay under `.context/`.
- [ ] Browser automation does not depend on the user's existing browser state.
- [ ] `npm run ts-build` or the relevant package build was run after frontend changes.
