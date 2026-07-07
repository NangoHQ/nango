/// <reference types="vitest" />
// Configure Vitest (https://vitest.dev/config/)

import { defaultExclude, defineConfig } from 'vitest/config';

process.env.TZ = 'UTC';

export default defineConfig({
    test: {
        include: ['**/*.integration.{test,spec}.?(c|m)[jt]s?(x)'],
        // Vitest 4 dropped dist/** from its defaultExclude, so compiled test files
        // built into packages/*/dist get collected and run as duplicates. Re-add it.
        exclude: [...defaultExclude, '**/dist/**'],
        globalSetup: './tests/setup.ts',
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
        pool: 'forks',
        // Vitest 4 removed test.poolOptions; poolOptions.forks.singleFork is now maxWorkers: 1.
        maxWorkers: 1,
        // Send worker console output straight to stdout/stderr instead of routing it
        // through Vitest's onUserConsoleLog RPC. Handlers here do fire-and-forget logging
        // (e.g. the proxy's enrichOperation in a finally block) that outlives the request,
        // so a stray log can land while the worker is tearing down. With interception on,
        // that races the closing RPC and fails the run with
        // "EnvironmentTeardownError: Closing rpc while onUserConsoleLog was pending".
        disableConsoleIntercept: true
    }
});
