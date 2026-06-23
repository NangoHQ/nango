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
 *      dimension over the last N days. ClickHouse materialized views aggregate
 *      them into the daily_* tables the dashboard reads.
 *
 * Run from the repo root:
 *   npm run seed:clickhouse
 *   npm run seed:clickhouse -- --account 3 --days 60 --no-reset
 *
 * Requires CLICKHOUSE_URL in .env and the clickhouse container up (npm run dev:docker).
 */
import { randomUUID } from 'node:crypto';

import db from '@nangohq/database';
import { createPlan, freePlan, updatePlanByTeam } from '@nangohq/shared';
import { Clickhouse, clickhouseClient, migrate } from '@nangohq/usage';

import type { ClickhouseRawUsageEvent } from '@nangohq/usage';

const DATABASE = 'usage';

// Integration/connection cardinality is deliberately high to exercise the
// breakdown filter combobox (see scripts/README.md):
//   - 20 integration_id values feed the integration search test — names share
//     substrings ("git" → github/gitlab, "google" → google-calendar/google-drive)
//     so partial-string matching has something to discriminate.
//   - 20 × 3 = 60 distinct connection_id values feed the connection pagination
//     test — well beyond the top-N breakdown cap (25), so the combobox spans
//     multiple pages.
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
const CONNECTIONS_PER_INTEGRATION = 3;
const FUNCTION_TYPES = ['sync', 'action', 'webhook'] as const;
const RUNTIMES = ['lambda', 'local'] as const;
const PACKAGES = ['runner', 'server'] as const;
const CALLSITES = ['proxy', 'webhook', 'action'] as const;

function parseArgs() {
    const argv = process.argv.slice(2);
    const value = (name: string): string | undefined => {
        const i = argv.indexOf(`--${name}`);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const account = value('account');
    const days = value('days');
    return {
        onlyAccount: account ? Number(account) : undefined,
        days: days ? Number(days) : 30,
        reset: !argv.includes('--no-reset')
    };
}

const rnd = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p: number): boolean => Math.random() < p;
function pick<T>(arr: readonly T[]): T {
    const value = arr[rnd(0, arr.length - 1)];
    if (value === undefined) {
        throw new Error('pick() called on an empty array');
    }
    return value;
}

// Midday UTC of `offset` days ago — keeps the event inside a single UTC calendar
// day (CH `toDate(ts)` buckets in UTC) regardless of the runner's local timezone.
const todayMidnightUTC = (() => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
})();
const dayTs = (offset: number): number => todayMidnightUTC - offset * 86_400_000 + 12 * 3_600_000;

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

function generateForEnvDay(accountId: number, environmentId: number, ts: number): ClickhouseRawUsageEvent[] {
    const events: ClickhouseRawUsageEvent[] = [];
    for (const integration of INTEGRATIONS) {
        const connections = Array.from({ length: CONNECTIONS_PER_INTEGRATION }, (_, i) => `${integration.id}-conn-${i + 1}`);
        const base = { environmentId, integrationId: integration.id };

        for (const connectionId of connections) {
            // proxy — mostly successful, with an occasional batch of failures
            events.push(event('usage.proxy', accountId, ts, rnd(5, 80), { ...base, connectionId, success: true }));
            if (chance(0.4)) {
                events.push(event('usage.proxy', accountId, ts, rnd(1, 10), { ...base, connectionId, success: false }));
            }

            // webhook_forwards — only for integrations that emit webhooks
            if (integration.webhooks) {
                events.push(event('usage.webhook_forward', accountId, ts, rnd(2, 30), { ...base, connectionId, success: true }));
                if (chance(0.3)) {
                    events.push(event('usage.webhook_forward', accountId, ts, rnd(1, 5), { ...base, connectionId, success: false }));
                }
            }

            // data_transfer — broken down by package + callsite
            for (const pkg of PACKAGES) {
                const callsite = pick(CALLSITES);
                const egressedBytes = rnd(500, 200_000);
                const ingressedBytes = rnd(500, 100_000);
                events.push(
                    event('usage.data_transfer', accountId, ts, egressedBytes + ingressedBytes, {
                        ...base,
                        connectionId,
                        package: pkg,
                        callsite,
                        egressedBytes,
                        ingressedBytes
                    })
                );
            }
        }

        // function_executions — one row per function type (value = #executions; telemetry is summed)
        for (const fnType of FUNCTION_TYPES) {
            const executions = rnd(1, 30);
            const perRunMs = rnd(40, 900);
            events.push(
                event('usage.function_executions', accountId, ts, executions, {
                    ...base,
                    connectionId: connections[0],
                    type: fnType,
                    functionName: `${integration.id}-${fnType}`,
                    runtime: pick(RUNTIMES),
                    success: true,
                    telemetryBag: {
                        durationMs: executions * perRunMs,
                        customLogs: executions * rnd(0, 6),
                        proxyCalls: executions * rnd(0, 4),
                        memoryGb: pick([0.5, 1, 2, 3])
                    }
                })
            );
        }

        // records — AVG metric, broken down by model. One batch per (connection, model) per day.
        for (const model of integration.models) {
            for (const connectionId of connections.slice(0, 2)) {
                events.push(event('usage.records', accountId, ts, rnd(50, 5_000), { ...base, connectionId, model, batchId: randomUUID() }));
            }
        }

        // connections — AVG metric, broken down only by environment + integration.
        events.push(event('usage.connections', accountId, ts, rnd(1, 25), { ...base, batchId: randomUUID() }));
    }
    return events;
}

async function resolveTargets(onlyAccount: number | undefined): Promise<{ accountId: number; environments: { id: number; name: string }[] }[]> {
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

    const targets: { accountId: number; environments: { id: number; name: string }[] }[] = [];
    for (const { id: accountId } of accountRows) {
        const environments = await db.knex
            .select<{ id: number; name: string }[]>('id', 'name')
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
    const { onlyAccount, days, reset } = parseArgs();

    if (!process.env['CLICKHOUSE_URL']) {
        console.error('✗ CLICKHOUSE_URL is not set.');
        console.error('  Add to .env:  CLICKHOUSE_URL=http://default:@localhost:8123');
        console.error('  And start the container:  npm run dev:docker');
        process.exit(1);
    }

    if (reset) {
        console.log(`Resetting local ClickHouse database "${DATABASE}" (synthetic dev data)…`);
        const client = clickhouseClient();
        await client?.command({ query: `DROP DATABASE IF EXISTS ${DATABASE}` });
        await client?.close();
    }

    console.log('Running ClickHouse migrations…');
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
        for (const env of environments) {
            const events: ClickhouseRawUsageEvent[] = [];
            for (let offset = 0; offset < days; offset++) {
                events.push(...generateForEnvDay(accountId, env.id, dayTs(offset)));
            }
            // Insert in chunks to keep batch sizes sane; the batcher flushes the rest.
            for (let i = 0; i < events.length; i += 1_000) {
                clickhouse.addRaw(events.slice(i, i + 1_000));
            }
            total += events.length;
            console.log(`  account ${accountId} · env ${env.id} (${env.name}): ${events.length} events`);
        }
    }

    const flushed = await clickhouse.flush();
    if (flushed.isErr()) {
        console.error(`✗ Flush failed: ${flushed.error}`);
        process.exit(1);
    }
    await clickhouse.shutdown();

    const fromDay = new Date(dayTs(days - 1)).toISOString().split('T')[0];
    const toDay = new Date(dayTs(0)).toISOString().split('T')[0];
    console.log(`\n✓ Seeded ${total} events across ${targets.length} account(s), ${days} days (${fromDay} → ${toDay}).`);
    console.log('  Materialized views aggregate raw_events into the daily_* tables the dashboard reads.');
    console.log('  Ensure FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE=100 (or your account is allowlisted) so the server reads ClickHouse.');
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
