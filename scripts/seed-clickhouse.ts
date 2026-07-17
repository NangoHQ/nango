import { randomUUID } from 'node:crypto';

import db from '@nangohq/database';
import { records } from '@nangohq/records';
import { connectionService, createPlan, environmentService, freePlan, updatePlanByTeam } from '@nangohq/shared';
import { Clickhouse, clickhouseClient, migrate } from '@nangohq/usage';

import type { ClickhouseRawUsageEvent } from '@nangohq/usage';

/**
 * Seeds the local ClickHouse `usage` database with synthetic usage events so the
 * billing/usage breakdown dashboard renders real-looking data without a deployed
 * backend or the ingestion pipeline (metering/ActiveMQ) running.
 *
 * What it does:
 *   1. Drops & re-migrates the `usage` database (skip with --no-reset to append).
 *   2. Detects local accounts + their environments from Postgres so the
 *      environment-breakdown chips resolve to real names.
 *   3. Ensures each target account has a (free) plan row — the billing-usage
 *      endpoint returns `feature_disabled` without one (and FLAG_PLAN_ENABLED
 *      must be on; see .env).
 *   4. Inserts events into `raw_events` across every metric and breakdown
 *      dimension over the last N days (default 60, enough to fill the dashboard's
 *      month view when navigating to the previous month). ClickHouse materialized
 *      views aggregate them into the daily_* tables the dashboard reads.
 *
 * Run from the repo root:
 *   npm run seed:clickhouse
 *   npm run seed:clickhouse -- --account 3 --days 90 --no-reset
 *   npm run seed:clickhouse -- --verbose              # per-env progress + summary
 *
 * Requires CLICKHOUSE_URL in .env and the clickhouse container up (npm run dev:docker).
 */

const DATABASE = 'usage';

// Integration/connection cardinality is deliberately high to exercise the
// breakdown filter combobox (see scripts/README.md):
//   - 20 integration_id values feed the integration search test — names share
//     substrings ("git" → github/gitlab, "google" → google-calendar/google-drive)
//     so partial-string matching has something to discriminate.
//   - hundreds of distinct connection UUIDs in prod (dev holds ~10% as many), skewed
//     like production (a few integrations have 60–150 connections, most a handful),
//     feed the connection pagination test — far beyond the top-N cap (25), so the
//     combobox spans many pages. Connection ids are UUIDs, matching production.
// It also exceeds the top-10 breakdown default, exercising the "rest" rollup.
const INTEGRATIONS: { id: string; models: string[]; webhooks: boolean }[] = [
    { id: 'salesforce', models: ['Contact', 'Account', 'Opportunity', 'Lead'], webhooks: false },
    { id: 'hubspot', models: ['Contact', 'Company', 'Deal'], webhooks: true },
    { id: 'google-calendar', models: ['Event', 'Calendar'], webhooks: false },
    { id: 'google-drive', models: ['File', 'Folder'], webhooks: false },
    { id: 'gmail', models: ['Message', 'Thread'], webhooks: true },
    { id: 'slack', models: ['Message', 'Channel', 'User'], webhooks: true },
    { id: 'github', models: ['Issue', 'PullRequest', 'Repository'], webhooks: true },
    { id: 'gitlab', models: ['Issue', 'MergeRequest', 'Project'], webhooks: true },
    { id: 'notion', models: ['Page', 'Database'], webhooks: false },
    { id: 'linear', models: ['Issue', 'Project', 'Cycle'], webhooks: true },
    { id: 'jira', models: ['Issue', 'Project', 'Sprint'], webhooks: true },
    { id: 'asana', models: ['Task', 'Project'], webhooks: false },
    { id: 'stripe', models: ['Charge', 'Customer', 'Invoice'], webhooks: true },
    { id: 'shopify', models: ['Order', 'Product', 'Customer'], webhooks: true },
    { id: 'zendesk', models: ['Ticket', 'User'], webhooks: true },
    { id: 'intercom', models: ['Conversation', 'Contact'], webhooks: true },
    { id: 'microsoft-teams', models: ['Message', 'Channel'], webhooks: false },
    { id: 'outlook', models: ['Message', 'Event'], webhooks: false },
    { id: 'dropbox', models: ['File', 'Folder'], webhooks: false },
    { id: 'airtable', models: ['Record', 'Table'], webhooks: false }
];
// Connection counts are skewed like production: a few integrations carry the bulk
// of the connections (e.g. the account's primary CRM with one connection per
// customer), while most have only a handful. Totals land in the hundreds per env.
const HIGH_VOLUME_INTEGRATION_CHANCE = 0.15;
const HIGH_VOLUME_CONNECTIONS: [number, number] = [60, 150];
const LONG_TAIL_CONNECTIONS: [number, number] = [2, 12];
const MONTHLY_CONNECTION_GROWTH: [number, number] = [1.1, 1.2];
const MONTHLY_TRAFFIC_GROWTH: [number, number] = [1.08, 1.18];
const WEEKEND_TRAFFIC_FACTOR = 0.82;
const DAILY_TRAFFIC_JITTER: [number, number] = [0.82, 1.18];
// dev holds ~10% as many connections as prod. That fewer-connections ratio is what
// makes dev ≈ 10% of traffic across every metric — no separate volume scaling.
const DEV_CONNECTION_SHARE = 0.1;
const RUNTIMES = ['lambda', 'local'] as const;
const PACKAGES = ['runner', 'server'] as const;
const CALLSITES = ['proxy', 'webhook', 'action'] as const;

function parseArgs() {
    const argv = process.argv.slice(2);
    const value = (name: string): string | undefined => {
        const i = argv.indexOf(`--${name}`);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const fail = (message: string): never => {
        console.error(`✗ ${message}`);
        process.exit(1);
    };

    const account = value('account');
    if (account !== undefined && !/^\d+$/.test(account)) {
        fail(`--account must be a non-negative integer, got "${account}".`);
    }
    const days = value('days');
    if (days !== undefined && (!/^\d+$/.test(days) || Number(days) === 0)) {
        fail(`--days must be a positive integer, got "${days}".`);
    }
    return {
        onlyAccount: account !== undefined ? Number(account) : undefined,
        // Default to 60 days so the dashboard's month view (1st → last day) is fully
        // covered even when the current month is only a few days in — a 30-day window
        // would leave the start of the previous month empty when you navigate back.
        days: days !== undefined ? Number(days) : 60,
        reset: !argv.includes('--no-reset'),
        allowRemote: argv.includes('--allow-remote'),
        verbose: argv.includes('--verbose'),
        // Make the data realistic for the Free caps view: (1) mirror the account's real Postgres
        // connection/record counts into ClickHouse (ramping to the live count) so those AVG metrics
        // match the DB-backed gauge, and (2) enforce the Free plan caps so counter metrics plateau
        // at their monthly cap instead of running arbitrarily over.
        mirrorDbCounts: argv.includes('--mirror-db-counts')
    };
}

/** Live Postgres counts the caps gauge uses for the AVG metrics (connections, records). */
async function getDbCounts(accountId: number): Promise<{ connections: number; records: number }> {
    const connections = await connectionService.countByAccountId(accountId);
    const envs = await environmentService.getEnvironmentsByAccountId(accountId);
    const environmentIds = envs.map((e) => e.id);
    let recordCount = 0;
    if (environmentIds.length > 0) {
        // Mirror the gauge (UsageTracker.getRecordsUsage): only count records whose connection
        // still exists. record_counts can retain rows for deleted connections, which the gauge
        // excludes (paginateConnections filters deleted=false) — summing them here would push the
        // mirror above the gauge that --mirror-db-counts is meant to match.
        for await (const page of records.paginateCounts({ environmentIds })) {
            if (page.isErr()) throw new Error(`paginateCounts failed: ${page.error}`);
            if (page.value.length === 0) {
                continue;
            }
            const connectionIds = page.value.map((r) => r.connection_id);
            for await (const connPage of connectionService.paginateConnections({ connectionIds })) {
                if (connPage.isErr()) throw new Error(`paginateConnections failed: ${connPage.error}`);
                for (const conn of connPage.value) {
                    recordCount += page.value.filter((r) => r.connection_id === conn.connection.id).reduce((sum, r) => sum + r.count, 0);
                }
            }
        }
    }
    return { connections, records: recordCount };
}

/**
 * Scale counter metrics so their monthly totals land at a realistic fraction of the Free caps: a
 * couple just over (so they hit the cap late in the month, then plateau) and the function group
 * comfortably under (so function runs are never blocked and the chart has data all month). Without
 * this the breakdown-test volume is many times the cap, so metrics deplete in the first few days.
 * The function group scales by its logs total (the binding function cap). Per calendar month.
 */
function scaleCountersForFreeDemo(events: ClickhouseRawUsageEvent[]): ClickhouseRawUsageEvent[] {
    const flags = freePlan.flags;
    const monthOf = (ts: number): string => new Date(ts).toISOString().slice(0, 7);

    const proxyTotal = new Map<string, number>();
    const webhookTotal = new Map<string, number>();
    const logsTotal = new Map<string, number>();
    for (const ev of events) {
        const m = monthOf(ev.ts);
        if (ev.type === 'usage.proxy') proxyTotal.set(m, (proxyTotal.get(m) ?? 0) + ev.value);
        else if (ev.type === 'usage.webhook_forward') webhookTotal.set(m, (webhookTotal.get(m) ?? 0) + ev.value);
        else if (ev.type === 'usage.function_executions') {
            const bag = (ev.attributes as { telemetryBag?: { customLogs?: number } }).telemetryBag;
            logsTotal.set(m, (logsTotal.get(m) ?? 0) + (bag?.customLogs ?? 0));
        }
    }
    const scaleFor =
        (totals: Map<string, number>, cap: number | null | undefined, target: number) =>
        (m: string): number => {
            const total = totals.get(m) ?? 0;
            return total > 0 && cap != null && Number.isFinite(cap) ? (target * cap) / total : 1;
        };
    const proxyScale = scaleFor(proxyTotal, flags.proxy_max, 1.15);
    const webhookScale = scaleFor(webhookTotal, flags.webhook_forwards_max, 1.1);
    const fnScale = scaleFor(logsTotal, flags.function_logs_max, 0.85);
    const scaled = (n: number, f: number): number => Math.max(1, Math.round(n * f));

    return events.map((ev) => {
        const m = monthOf(ev.ts);
        if (ev.type === 'usage.proxy') return { ...ev, value: scaled(ev.value, proxyScale(m)) };
        if (ev.type === 'usage.webhook_forward') return { ...ev, value: scaled(ev.value, webhookScale(m)) };
        if (ev.type === 'usage.function_executions') {
            const f = fnScale(m);
            const attrs = ev.attributes as { telemetryBag?: { customLogs?: number; durationMs?: number } };
            const bag = attrs.telemetryBag;
            return {
                ...ev,
                value: scaled(ev.value, f),
                attributes: bag
                    ? {
                          ...attrs,
                          telemetryBag: { ...bag, customLogs: Math.round((bag.customLogs ?? 0) * f), durationMs: Math.round((bag.durationMs ?? 0) * f) }
                      }
                    : ev.attributes
            } as ClickhouseRawUsageEvent;
        }
        return ev;
    });
}

/**
 * Model Free-plan cap enforcement: once a metric hits its monthly cap, further usage is blocked, so
 * it plateaus at the cap instead of running arbitrarily over. proxy and webhook_forward each cap
 * independently; the function metrics — executions plus derived logs (Σ customLogs) and compute
 * (Σ durationMs) — all stop together once the first of their caps is reached (function runs are
 * blocked). Caps reset per calendar month. Events for other metrics pass through untouched.
 */
function capUsageAtFreeLimits(events: ClickhouseRawUsageEvent[]): ClickhouseRawUsageEvent[] {
    const flags = freePlan.flags;
    const proxyCap = flags.proxy_max ?? Infinity;
    const webhookCap = flags.webhook_forwards_max ?? Infinity;
    const execCap = flags.function_executions_max ?? Infinity;
    const logsCap = flags.function_logs_max ?? Infinity;
    const computeCap = flags.function_compute_gbms_max ?? Infinity;
    const monthOf = (ts: number): string => new Date(ts).toISOString().slice(0, 7);

    const proxy = new Map<string, number>();
    const webhook = new Map<string, number>();
    const exec = new Map<string, number>();
    const logs = new Map<string, number>();
    const compute = new Map<string, number>();

    const kept: ClickhouseRawUsageEvent[] = [];
    // Chronological so each month's cap fills from its first day.
    for (const ev of [...events].sort((a, b) => a.ts - b.ts)) {
        const m = monthOf(ev.ts);
        if (ev.type === 'usage.proxy') {
            const used = proxy.get(m) ?? 0;
            if (used >= proxyCap) continue;
            const value = Math.min(ev.value, proxyCap - used);
            proxy.set(m, used + value);
            kept.push(value === ev.value ? ev : { ...ev, value });
        } else if (ev.type === 'usage.webhook_forward') {
            const used = webhook.get(m) ?? 0;
            if (used >= webhookCap) continue;
            const value = Math.min(ev.value, webhookCap - used);
            webhook.set(m, used + value);
            kept.push(value === ev.value ? ev : { ...ev, value });
        } else if (ev.type === 'usage.function_executions') {
            if ((exec.get(m) ?? 0) >= execCap || (logs.get(m) ?? 0) >= logsCap || (compute.get(m) ?? 0) >= computeCap) {
                continue; // function runs blocked once any function cap is hit
            }
            const bag = (ev.attributes as { telemetryBag?: { customLogs?: number; durationMs?: number } }).telemetryBag;
            exec.set(m, (exec.get(m) ?? 0) + ev.value);
            logs.set(m, (logs.get(m) ?? 0) + (bag?.customLogs ?? 0));
            compute.set(m, (compute.get(m) ?? 0) + (bag?.durationMs ?? 0));
            kept.push(ev);
        } else {
            kept.push(ev);
        }
    }
    return kept;
}

const rnd = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
const rndFloat = (min: number, max: number): number => Math.random() * (max - min) + min;
const chance = (p: number): boolean => Math.random() < p;
function pick<T>(arr: readonly T[]): T {
    const value = arr[rnd(0, arr.length - 1)];
    if (value === undefined) {
        throw new Error('pick() called on an empty array');
    }
    return value;
}

// Base (prod) connection count per integration, decided once. Skewed like production:
// a few integrations carry the bulk of the connections, most have only a handful.
const connectionCountCache = new Map<string, number>();
function baseConnectionCount(integrationId: string): number {
    let count = connectionCountCache.get(integrationId);
    if (count === undefined) {
        const [min, max] = chance(HIGH_VOLUME_INTEGRATION_CHANCE) ? HIGH_VOLUME_CONNECTIONS : LONG_TAIL_CONNECTIONS;
        count = rnd(min, max);
        connectionCountCache.set(integrationId, count);
    }
    return count;
}

// Midday UTC of `offset` days ago — keeps the event inside a single UTC calendar
// day (CH `toDate(ts)` buckets in UTC) regardless of the runner's local timezone.
const todayMidnightUTC = (() => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
})();
const dayTs = (offset: number): number => todayMidnightUTC - offset * 86_400_000 + 12 * 3_600_000;

// Each integration gets its own compounded monthly growth rate (10–20%). Growth is
// spread across days, not calendar months, so the chart shows a gradual climb
// rather than a flat line within the current month.
const DAYS_PER_MONTH = 30;
const connectionGrowthCache = new Map<string, number>();
function connectionMonthlyGrowth(integrationId: string): number {
    let growth = connectionGrowthCache.get(integrationId);
    if (growth === undefined) {
        growth = rndFloat(...MONTHLY_CONNECTION_GROWTH);
        connectionGrowthCache.set(integrationId, growth);
    }
    return growth;
}

function daysAgo(ts: number): number {
    return Math.round((todayMidnightUTC - ts) / 86_400_000);
}

// Connections compound at the integration's monthly rate — the same trend shape as flow
// metrics: fullCount today, and fullCount / growth^(months ago) further back. So each
// 30-day span (e.g. one dashboard month view) climbs by the full 10–20%, independent of
// how many days were seeded. No random noise — connections grow smoothly, so the chart
// shows a clean climb rather than wiggling, and small pools avoid integer plateaus.
function reportedConnectionCount(integrationId: string, fullCount: number, ts: number): number {
    if (fullCount === 0) {
        return 0;
    }
    const monthlyGrowth = connectionMonthlyGrowth(integrationId);
    const exact = fullCount * monthlyGrowth ** (-daysAgo(ts) / DAYS_PER_MONTH);
    return Math.max(1, Math.round(exact));
}

function isWeekend(ts: number): boolean {
    const day = new Date(ts).getUTCDay();
    return day === 0 || day === 6;
}

// Deterministic per-day jitter so the chart wiggles without changing on every re-seed.
function dayTrafficJitter(ts: number): number {
    const dayKey = Math.floor(ts / 86_400_000);
    const frac = Math.abs(Math.sin(dayKey * 12.9898) * 43758.5453) % 1;
    return DAILY_TRAFFIC_JITTER[0] + frac * (DAILY_TRAFFIC_JITTER[1] - DAILY_TRAFFIC_JITTER[0]);
}

// Flow metrics (runs, records, proxy, …) share one daily profile: gradual growth over the
// seed window, quieter weekends, and small day-to-day noise.
function trafficScale(ts: number, monthlyGrowth: number): number {
    const trend = monthlyGrowth ** (-daysAgo(ts) / DAYS_PER_MONTH);
    const weekend = isWeekend(ts) ? WEEKEND_TRAFFIC_FACTOR : 1;
    return trend * weekend * dayTrafficJitter(ts);
}

function scaledInt(min: number, max: number, scale: number, floor = 1): number {
    return Math.max(floor, Math.round(rnd(min, max) * scale));
}

// Connection ids are UUIDs in reality. Memoize the current connection pool per
// (environment, integration), then slice it by date so the same connections recur while
// older months have fewer active connections. dev holds ~10% as many current
// connections as prod (DEV_CONNECTION_SHARE) — having fewer connections is what makes
// dev ≈ 10% of traffic across every metric. dev may end up with 0 for small
// integrations (it simply doesn't use them).
const connectionIdCache = new Map<string, string[]>();
function connectionPool(environmentId: number, integrationId: string, isProduction: boolean): string[] {
    const key = `${environmentId}:${integrationId}`;
    let connections = connectionIdCache.get(key);
    if (!connections) {
        const base = baseConnectionCount(integrationId);
        const count = isProduction ? base : Math.round(base * DEV_CONNECTION_SHARE);
        connections = Array.from({ length: count }, () => randomUUID());
        connectionIdCache.set(key, connections);
    }
    return connections;
}

function connectionsFor(environmentId: number, integrationId: string, isProduction: boolean, ts: number): string[] {
    const pool = connectionPool(environmentId, integrationId, isProduction);
    return pool.slice(0, reportedConnectionCount(integrationId, pool.length, ts));
}

function event(
    type: ClickhouseRawUsageEvent['type'],
    accountId: number,
    ts: number,
    value: number,
    attributes: Record<string, unknown>
): ClickhouseRawUsageEvent {
    return {
        ts,
        type,
        idempotency_key: `${type}-${randomUUID()}`,
        account_id: accountId,
        value,
        attributes: attributes as ClickhouseRawUsageEvent['attributes']
    };
}

function generateForEnvDay(
    accountId: number,
    environmentId: number,
    isProduction: boolean,
    ts: number,
    batchId: string,
    trafficMonthlyGrowth: number,
    // When true, skip synthetic connections/records — they're emitted once per account/day in the
    // main loop from the real DB counts so the Free caps drill-in matches the gauge.
    mirrorDbCounts: boolean
): ClickhouseRawUsageEvent[] {
    const events: ClickhouseRawUsageEvent[] = [];
    const dayScale = trafficScale(ts, trafficMonthlyGrowth);
    // One failure rate for the whole day, shared across this day's function groups, so
    // the failure series fluctuates day to day (mostly healthy, occasional spikes)
    // instead of averaging to a flat ~10%. Squared → biased low; capped near 20%.
    const dayFailureRate = Math.random() ** 2 * 0.2;
    for (const integration of INTEGRATIONS) {
        const pool = connectionPool(environmentId, integration.id, isProduction);
        if (pool.length === 0) {
            continue; // dev doesn't actively use every integration
        }
        const connections = connectionsFor(environmentId, integration.id, isProduction, ts);
        if (connections.length === 0) {
            continue;
        }
        const base = { environmentId, integrationId: integration.id };

        for (const connectionId of connections) {
            // Skip a fraction of connections on the quietest days only. dayScale bottoms out
            // around 0.49 over the default 60-day window (deep-weekend, low-jitter, oldest days),
            // so 0.55 catches just that tail; a lower threshold like 0.45 never fires.
            if (dayScale < 0.55 && chance(0.2)) {
                continue;
            }

            // proxy — mostly successful, with an occasional batch of failures
            events.push(event('usage.proxy', accountId, ts, scaledInt(5, 80, dayScale), { ...base, connectionId, success: true }));
            if (chance(0.4 * Math.min(1, dayScale + 0.3))) {
                events.push(event('usage.proxy', accountId, ts, scaledInt(1, 10, dayScale), { ...base, connectionId, success: false }));
            }

            // webhook_forwards — only for integrations that emit webhooks
            if (integration.webhooks) {
                events.push(event('usage.webhook_forward', accountId, ts, scaledInt(2, 30, dayScale), { ...base, connectionId, success: true }));
                if (chance(0.3 * Math.min(1, dayScale + 0.3))) {
                    events.push(event('usage.webhook_forward', accountId, ts, scaledInt(1, 5, dayScale), { ...base, connectionId, success: false }));
                }
            }

            // data_transfer — broken down by package + callsite
            for (const pkg of PACKAGES) {
                const egressedBytes = scaledInt(500, 200_000, dayScale, 100);
                const ingressedBytes = scaledInt(500, 100_000, dayScale, 100);
                events.push(
                    event('usage.data_transfer', accountId, ts, egressedBytes + ingressedBytes, {
                        ...base,
                        connectionId,
                        package: pkg,
                        callsite: pick(CALLSITES),
                        egressedBytes,
                        ingressedBytes
                    })
                );
            }

            // function_executions — runs happen per connection (its own syncs/actions),
            // so they spread roughly evenly across connections. sync runs every day;
            // actions/webhooks fire some days. value = #runs, split by the day's rate.
            const fnRuns: { type: 'sync' | 'action' | 'webhook'; runs: number }[] = [{ type: 'sync', runs: scaledInt(1, 10, dayScale) }];
            if (chance(0.5 * Math.min(1, dayScale + 0.25))) {
                fnRuns.push({ type: 'action', runs: scaledInt(1, 6, dayScale) });
            }
            if (integration.webhooks && chance(0.5 * Math.min(1, dayScale + 0.25))) {
                fnRuns.push({ type: 'webhook', runs: scaledInt(1, 8, dayScale) });
            }
            for (const { type, runs } of fnRuns) {
                const failed = Math.min(runs, Math.round(runs * dayFailureRate * rndFloat(0.7, 1.3)));
                const perRunMs = scaledInt(40, 900, dayScale * rndFloat(0.9, 1.1));
                for (const [success, count] of [
                    [true, runs - failed],
                    [false, failed]
                ] as const) {
                    if (count <= 0) {
                        continue;
                    }
                    events.push(
                        event('usage.function_executions', accountId, ts, count, {
                            ...base,
                            connectionId,
                            type,
                            functionName: `${integration.id}-${type}`,
                            runtime: pick(RUNTIMES),
                            success,
                            telemetryBag: {
                                durationMs: count * perRunMs,
                                customLogs: count * rnd(0, Math.max(1, Math.round(6 * dayScale))),
                                proxyCalls: count * rnd(0, Math.max(1, Math.round(4 * dayScale))),
                                memoryGb: pick([0.5, 1, 2, 3])
                            }
                        })
                    );
                }
            }
        }

        // records + connections (AVG metrics) are synthetic per-integration volume by default.
        // With --mirror-db-counts they come from the primary DB instead — emitted once per
        // account/day in the main loop — so the Free caps drill-in matches the DB-backed gauge.
        if (!mirrorDbCounts) {
            // records — AVG metric. The snapshot shares the day's batchId so the metric
            // reflects the daily total record count, not a per-integration average.
            for (const model of integration.models) {
                for (const connectionId of connections.slice(0, 2)) {
                    events.push(event('usage.records', accountId, ts, scaledInt(50, 5_000, dayScale, 10), { ...base, connectionId, model, batchId }));
                }
            }

            // connections — AVG metric. value = this integration's active connection count.
            // Shares the day's batchId so the headline is the daily total, not a per-row average.
            events.push(
                event('usage.connections', accountId, ts, reportedConnectionCount(integration.id, pool.length, ts), {
                    ...base,
                    batchId
                })
            );
        }
    }
    return events;
}

async function resolveTargets(
    onlyAccount: number | undefined
): Promise<{ accountId: number; environments: { id: number; name: string; isProduction: boolean }[] }[]> {
    // Default to the "real" local orgs (those with more than one environment —
    // e.g. dev + prod). A fresh local DB seeds hundreds of throwaway single-env
    // fixture accounts; seeding all of them would be millions of rows. Pass
    // --account <id> to target a specific one.
    let accountRows: { id: number }[];
    if (onlyAccount !== undefined) {
        accountRows = [{ id: onlyAccount }];
    } else {
        accountRows = await db.knex
            .select<{ id: number }[]>('account_id as id')
            .from('_nango_environments')
            .where({ deleted: false })
            .groupBy('account_id')
            .havingRaw('count(*) > 1')
            .orderBy('account_id');
        if (accountRows.length === 0) {
            const [first] = await db.knex.select<{ id: number }[]>('id').from('_nango_accounts').orderBy('id').limit(1);
            accountRows = first ? [first] : [];
        }
    }

    const targets: { accountId: number; environments: { id: number; name: string; isProduction: boolean }[] }[] = [];
    for (const { id: accountId } of accountRows) {
        const environments = await db.knex
            .select<{ id: number; name: string; isProduction: boolean }[]>('id', 'name', { isProduction: 'is_production' })
            .from('_nango_environments')
            .where({ account_id: accountId, deleted: false })
            .orderBy('id');
        if (environments.length === 0) {
            console.warn(`⚠️  account ${accountId} has no environments — skipping`);
            continue;
        }
        targets.push({ accountId, environments });
    }
    return targets;
}

async function main() {
    const { onlyAccount, days, reset, allowRemote, verbose, mirrorDbCounts } = parseArgs();

    const clickhouseUrl = process.env['CLICKHOUSE_URL'];
    if (!clickhouseUrl) {
        console.error('✗ CLICKHOUSE_URL is not set.');
        console.error('  Add to .env:  CLICKHOUSE_URL=http://default:@localhost:8123');
        console.error('  And start the container:  npm run dev:docker');
        process.exit(1);
    }

    // This script DROPs and re-seeds the `usage` database, so refuse to run against a
    // non-local ClickHouse — a stray CLICKHOUSE_URL must not be able to wipe a remote
    // instance. --allow-remote overrides (you almost certainly shouldn't).
    const host = new URL(clickhouseUrl).hostname;
    const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
    if (!LOCAL_HOSTS.has(host) && !allowRemote) {
        console.error(`✗ Refusing to run against non-local ClickHouse host "${host}".`);
        console.error('  This script resets and seeds synthetic data — it is meant for local dev only.');
        console.error('  Pass --allow-remote to override.');
        process.exit(1);
    }

    if (reset) {
        if (verbose) {
            console.log(`Resetting local ClickHouse database "${DATABASE}" (synthetic dev data)…`);
        }
        const client = clickhouseClient();
        await client?.command({ query: `DROP DATABASE IF EXISTS ${DATABASE}` });
        await client?.close();
    }

    if (verbose) {
        console.log('Running ClickHouse migrations…');
    }
    const migrated = await migrate();
    if (migrated.isErr()) {
        console.error(`✗ Migration failed: ${migrated.error}`);
        process.exit(1);
    }

    const targets = await resolveTargets(onlyAccount);
    if (targets.length === 0) {
        console.error('✗ No accounts with environments found. Sign up at http://localhost:3000 first, or pass --account <id>.');
        process.exit(1);
    }

    // The billing-usage endpoint requires a plan row (and FLAG_PLAN_ENABLED=true).
    // createPlan ignores the insert when a row already exists, so set the placeholder
    // orb_* ids via a follow-up update — they make the controller skip its Orb
    // customer/subscription backfill so it works on the first request with no Orb
    // configured (NoopBillingClient).
    for (const { accountId } of targets) {
        const created = await createPlan(db.knex, { account_id: accountId, name: 'free', ...freePlan.flags });
        if (created.isErr()) {
            console.warn(`⚠️  could not ensure a plan for account ${accountId}: ${created.error}`);
        }
        const updated = await updatePlanByTeam(db.knex, {
            account_id: accountId,
            orb_customer_id: `local-customer-${accountId}`,
            orb_subscription_id: `local-sub-${accountId}`
        });
        if (updated.isErr()) {
            console.warn(`⚠️  could not set placeholder billing ids for account ${accountId}: ${updated.error}`);
        }
    }

    const clickhouse = new Clickhouse();
    let total = 0;
    for (const { accountId, environments } of targets) {
        const trafficMonthlyGrowth = rndFloat(...MONTHLY_TRAFFIC_GROWTH);
        // One snapshot batchId per day, shared across environments — matches the real
        // metering cron so the AVG metrics (connections, records) reconstruct the daily
        // total instead of a per-row average.
        const dayBatchIds = Array.from({ length: days }, () => randomUUID());
        const dbCounts = mirrorDbCounts ? await getDbCounts(accountId) : null;
        const prodEnv = environments.find((e) => e.isProduction) ?? environments[0];

        // Collect the whole account (all envs) before flushing so the Free-cap plateau can enforce
        // the account-level monthly caps across prod + dev together.
        const accountEvents: ClickhouseRawUsageEvent[] = [];
        for (const env of environments) {
            for (const [offset, batchId] of dayBatchIds.entries()) {
                accountEvents.push(...generateForEnvDay(accountId, env.id, env.isProduction, dayTs(offset), batchId, trafficMonthlyGrowth, mirrorDbCounts));
            }
            // Mirror snapshots: one connections + one records event per day (prod env), ramping from
            // a fraction of the count up to the live DB count on the newest day — so the AVG charts
            // match the gauge and still show growth rather than a flat line.
            if (dbCounts && prodEnv && env.id === prodEnv.id) {
                const grow = (final: number, startFraction: number, offset: number): number => {
                    if (offset === 0) return final;
                    const start = Math.max(1, Math.round(final * startFraction));
                    const progress = days > 1 ? (days - 1 - offset) / (days - 1) : 1;
                    return Math.round(start + (final - start) * progress);
                };
                for (const [offset, batchId] of dayBatchIds.entries()) {
                    const ts = dayTs(offset);
                    const attrs = { environmentId: env.id, integrationId: 'demo-github', batchId };
                    accountEvents.push(event('usage.connections', accountId, ts, grow(dbCounts.connections, 0.25, offset), attrs));
                    accountEvents.push(
                        event('usage.records', accountId, ts, grow(dbCounts.records, 0.1, offset), { ...attrs, connectionId: 'db-mirror', model: 'Contact' })
                    );
                }
            }
        }

        // Enforce the Free caps: counters plateau at their monthly cap once reached (realistic
        // blocking) rather than running arbitrarily over.
        const finalEvents = mirrorDbCounts ? capUsageAtFreeLimits(scaleCountersForFreeDemo(accountEvents)) : accountEvents;

        // Flush in chunks with a per-chunk await. The generate loop above is synchronous and never
        // yields, so the batcher's auto-flush can't run mid-loop; awaiting per chunk applies
        // backpressure and keeps the queue below maxQueueSize instead of silently dropping the tail.
        for (let i = 0; i < finalEvents.length; i += 1_000) {
            clickhouse.addRaw(finalEvents.slice(i, i + 1_000));
            await clickhouse.flush();
        }
        total += finalEvents.length;
        if (verbose) {
            console.log(`  account ${accountId}: ${finalEvents.length} events`);
        }
    }

    // shutdown() drains anything still queued, retrying within its timeout. If it errors,
    // some events were dropped — fail loudly rather than report a count that didn't land.
    const drained = await clickhouse.shutdown();
    if (drained.isErr()) {
        console.error(`✗ Not all events were persisted: ${drained.error}`);
        process.exit(1);
    }

    const fromDay = new Date(dayTs(days - 1)).toISOString().split('T')[0];
    const toDay = new Date(dayTs(0)).toISOString().split('T')[0];
    console.log(`\n✓ Seeded ${total} events across ${targets.length} account(s), ${days} days (${fromDay} → ${toDay}).`);
    if (verbose) {
        console.log('  Materialized views aggregate raw_events into the daily_* tables the dashboard reads.');
        console.log('  Ensure FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE=100 (or your account is allowlisted) so the server reads ClickHouse.');
    }
}

main()
    .then(async () => {
        await db.knex.destroy();
        process.exit(0);
    })
    .catch(async (err: unknown) => {
        console.error(err);
        await db.knex.destroy();
        process.exit(1);
    });
