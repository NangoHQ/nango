/// <reference types="vitest" />
// Configure Vitest (https://vitest.dev/config/)

import fs from 'node:fs';
import path from 'node:path';

import { defaultExclude, defineConfig } from 'vitest/config';

process.env.TZ = 'UTC';

// Tests that cannot share a process with the rest of the suite.
//
// `vi.mock` only intercepts a module that has not been imported yet, and with a shared registry
// the server graph is already loaded by the time these files register their mocks, so the real
// module wins. Discovered by scanning rather than listed by hand: a hardcoded list silently
// breaks whenever someone adds a `vi.mock` suite, and the failure looks like an unrelated bug
// (the real client runs, so you get a 500 rather than a mocking error).
function findSuitesUsingViMock(root: string): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
                continue;
            }
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.name.endsWith('.integration.test.ts') && fs.readFileSync(full, 'utf8').includes('vi.mock(')) {
                found.push(full);
            }
        }
    };
    walk(root);
    return found;
}

// The scheduler and orchestrator suites run live daemons that compete over SKIP LOCKED dequeues,
// so they still need a process boundary even now that they own their schemas and close their pools.
const runsLiveDaemons = ['**/packages/scheduler/**/*.integration.test.ts', '**/packages/orchestrator/**/*.integration.test.ts'];

const needsOwnProcess = [...findSuitesUsingViMock('packages'), ...runsLiveDaemons];

const shared = {
    include: ['**/*.integration.{test,spec}.?(c|m)[jt]s?(x)'],
    // Vitest 4 dropped dist/** from its defaultExclude, so compiled test files
    // built into packages/*/dist get collected and run as duplicates. Re-add it.
    exclude: [...defaultExclude, '**/dist/**'],
    setupFiles: './tests/setupFiles.ts',
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
        NANGO_ENCRYPTION_KEY: 'RzV4ZGo5RlFKMm0wYWlXdDhxTFhwb3ZrUG5KNGg3TmU=',
        NANGO_LOGS_ENABLED: 'true',
        NANGO_LOGS_ES_PREFIX: 'test',
        FLAG_PLAN_ENABLED: 'true',
        ORCHESTRATOR_SERVICE_URL: 'http://orchestrator',
        RUNNER_NODE_ID: '1',
        FLAG_API_RATE_LIMIT_ENABLED: 'false',
        FLAG_AUTH_ROLES_ENABLED: 'true',
        // Used by allProxy.integration.test.ts denylist case; must be set before server modules load
        NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: JSON.stringify(['denylisted-proxy-test.invalid']),
        // Opens the per-request `source=clickhouse` override gate so
        // getBillingUsage.integration.test.ts can exercise the CH path.
        // No effect on default behavior — every other request without the
        // explicit override still resolves to Orb.
        FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE: 'true'
    },
    fileParallelism: false,
    pool: 'forks' as const,
    // Vitest 4 removed test.poolOptions; poolOptions.forks.singleFork is now maxWorkers: 1.
    maxWorkers: 1
};

export default defineConfig({
    test: {
        // Same suite, split into two filesets that differ only in `isolate`. globalSetup stays
        // at the root so one set of containers is started for the run and shared by both,
        // rather than each fileset spinning up its own Postgres and Elasticsearch.
        globalSetup: './tests/setup.ts',
        projects: [
            {
                test: {
                    ...shared,
                    name: 'integration',
                    exclude: [...shared.exclude, ...needsOwnProcess],
                    // Safe to share a process: these are already serial and already share
                    // Postgres and Elasticsearch, so a fresh process per file adds no isolation
                    // it does not already have, and re-imports the whole @nangohq graph each time.
                    isolate: false
                }
            },
            {
                test: {
                    ...shared,
                    name: 'integration-isolated',
                    include: needsOwnProcess,
                    isolate: true
                }
            }
        ]
    }
});
