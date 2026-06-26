import { randomUUID } from 'node:crypto';

import db from '@nangohq/database';
import { createPlan, freePlan, updatePlanByTeam } from '@nangohq/shared';
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
        verbose: argv.includes('--verbose')
    };
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

function connectionProgress(ts: number, seedDays: number): number {
    const window = Math.max(1, seedDays - 1);
    return Math.max(0, Math.min(1, 1 - daysAgo(ts) / window));
}

// Linear ramp from (fullCount / monthlyGrowth) at the oldest seeded day to fullCount
// today. Avoids integer plateaus on small pools and skips the ±15% random noise that
// was flattening the connections chart.
function reportedConnectionCount(integrationId: string, fullCount: number, ts: number, seedDays: number): number {
    if (fullCount === 0) {
        return 0;
    }
    const monthlyGrowth = connectionMonthlyGrowth(integrationId);
    const startCount = fullCount / monthlyGrowth;
    const exact = startCount + (fullCount - startCount) * connectionProgress(ts, seedDays);
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

function connectionsFor(environmentId: number, integrationId: string, isProduction: boolean, ts: number, seedDays: number): string[] {
    const pool = connectionPool(environmentId, integrationId, isProduction);
    return pool.slice(0, reportedConnectionCount(integrationId, pool.length, ts, seedDays));
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
    seedDays: number
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
        const connections = connectionsFor(environmentId, integration.id, isProduction, ts, seedDays);
        if (connections.length === 0) {
            continue;
        }
        const base = { environmentId, integrationId: integration.id };

        for (const connectionId of connections) {
            // Skip a fraction of connections on the quietest days only.
            if (dayScale < 0.45 && chance(0.2)) {
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
            event('usage.connections', accountId, ts, reportedConnectionCount(integration.id, pool.length, ts, seedDays), {
                ...base,
                batchId
            })
        );
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
    const { onlyAccount, days, reset, allowRemote, verbose } = parseArgs();

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
        for (const env of environments) {
            const events: ClickhouseRawUsageEvent[] = [];
            for (const [offset, batchId] of dayBatchIds.entries()) {
                events.push(...generateForEnvDay(accountId, env.id, env.isProduction, dayTs(offset), batchId, trafficMonthlyGrowth, days));
            }
            // Flush each chunk before generating the next. The whole generate loop is
            // synchronous and never yields, so the batcher's auto-flush can't run mid-loop;
            // without awaiting here the queue fills past maxQueueSize (default 500k) and
            // silently drops the tail on long runs (large --days or many accounts). Awaiting
            // flush per chunk applies backpressure and keeps the queue near-empty; the chunk
            // stays below maxBatchSize so each flush drains it fully. Transient insert errors
            // are retried by the batcher on the next flush / during shutdown.
            for (let i = 0; i < events.length; i += 1_000) {
                clickhouse.addRaw(events.slice(i, i + 1_000));
                await clickhouse.flush();
            }
            total += events.length;
            if (verbose) {
                console.log(`  account ${accountId} · env ${env.id} (${env.name}): ${events.length} events`);
            }
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
