import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import Orb from 'orb-billing';

import { parseMigrationCsv } from './csv.js';

import type { MigrationRow } from './csv.js';

interface OrbSubscription {
    id: string;
    customer: { external_customer_id: string | null };
    plan: { external_plan_id: string | null } | null;
    pending_subscription_change?: { id: string } | null;
}

interface OrbSubscriptionScheduleItem {
    start_date: string;
    plan: { external_plan_id: string | null } | null;
}

export interface OrbSubscriptionsClient {
    list(params: { external_customer_id: string[]; status: 'active'; limit: 100 }): AsyncIterable<OrbSubscription>;
    fetchSchedule(subscriptionId: string): AsyncIterable<OrbSubscriptionScheduleItem>;
    schedulePlanChange(
        subscriptionId: string,
        params: { change_option: 'end_of_subscription_term'; auto_collection: true; external_plan_id: string }
    ): Promise<unknown>;
}

export interface ScheduleClient {
    subscriptions: OrbSubscriptionsClient;
}

export interface Summary {
    dryRun: number;
    scheduled: number;
    skipped: number;
    failed: number;
}

export const DEFAULT_THROTTLE_MS = 2_000;

const PAYG_EXTERNAL_PLAN_ID = 'pay-as-you-go';

const SUBSCRIPTION_LOOKUP_BATCH_SIZE = 100;

function usage(): string {
    return 'Usage: npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts <input.csv> [--execute] [--throttle-ms=<milliseconds>]';
}

export function parseArgs(args: string[]): { inputPath: string; execute: boolean; throttleMs: number } {
    const execute = args.includes('--execute');
    const throttleArgument = args.find((arg) => arg.startsWith('--throttle-ms='));
    const positional = args.filter((arg) => arg !== '--execute' && arg !== throttleArgument);

    if (
        positional.length !== 1 ||
        args.some((arg) => arg.startsWith('--') && arg !== '--execute' && arg !== throttleArgument) ||
        args.filter((arg) => arg.startsWith('--throttle-ms=')).length > 1
    ) {
        throw new Error(usage());
    }

    const [inputPath] = positional;
    if (!inputPath) {
        throw new Error(usage());
    }

    const throttleValue = throttleArgument?.slice('--throttle-ms='.length);
    if (throttleValue === '') {
        throw new Error('--throttle-ms must be a non-negative integer');
    }

    const throttleMs = throttleValue === undefined ? DEFAULT_THROTTLE_MS : Number(throttleValue);
    if (!Number.isSafeInteger(throttleMs) || throttleMs < 0) {
        throw new Error('--throttle-ms must be a non-negative integer');
    }

    return { inputPath, execute, throttleMs };
}

function logSkip(accountId: string, reason: string): void {
    console.log(`SKIP account ${accountId}: ${reason}`);
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

async function getFutureScheduledPlanChange(subscriptionId: string, client: ScheduleClient, now: Date): Promise<OrbSubscriptionScheduleItem | null> {
    for await (const item of client.subscriptions.fetchSchedule(subscriptionId)) {
        const startsAt = new Date(item.start_date);
        if (Number.isNaN(startsAt.getTime())) {
            throw new Error(`Orb returned an invalid schedule start date for subscription ${subscriptionId}`);
        }
        if (startsAt > now) {
            return item;
        }
    }
    return null;
}

async function getActiveSubscriptionsByAccountId(
    client: ScheduleClient,
    accountIds: string[]
): Promise<{ subscriptions: Map<string, OrbSubscription[]>; errors: Map<string, Error> }> {
    const subscriptions = new Map(accountIds.map((accountId) => [accountId, [] as OrbSubscription[]]));
    const errors = new Map<string, Error>();

    for (const accountIdBatch of chunk(accountIds, SUBSCRIPTION_LOOKUP_BATCH_SIZE)) {
        try {
            // The SDK's async iterator follows Orb's cursors, so a malformed account with multiple
            // active subscriptions cannot hide behind the endpoint's maximum page size of 100.
            for await (const subscription of client.subscriptions.list({
                external_customer_id: accountIdBatch,
                status: 'active',
                limit: SUBSCRIPTION_LOOKUP_BATCH_SIZE
            })) {
                const accountId = subscription.customer.external_customer_id;
                if (accountId) {
                    subscriptions.get(accountId)?.push(subscription);
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            for (const accountId of accountIdBatch) {
                errors.set(accountId, new Error(message));
            }
        }
    }

    return { subscriptions, errors };
}

export async function scheduleMigrations({
    client,
    rows,
    execute,
    throttleMs = DEFAULT_THROTTLE_MS
}: {
    client: ScheduleClient;
    rows: MigrationRow[];
    execute: boolean;
    throttleMs?: number;
}): Promise<Summary> {
    const planExternalId = PAYG_EXTERNAL_PLAN_ID;
    const summary: Summary = { dryRun: 0, scheduled: 0, skipped: 0, failed: 0 };
    let hasAttemptedSchedule = false;

    const { subscriptions: subscriptionsByAccountId, errors: lookupErrors } = await getActiveSubscriptionsByAccountId(
        client,
        rows.map((row) => row.accountId)
    );

    for (const row of rows) {
        try {
            const lookupError = lookupErrors.get(row.accountId);
            if (lookupError) {
                throw lookupError;
            }

            const subscriptions = subscriptionsByAccountId.get(row.accountId) ?? [];
            if (subscriptions.length === 0) {
                summary.skipped++;
                logSkip(row.accountId, 'no active Orb subscription');
                continue;
            }
            if (subscriptions.length !== 1) {
                summary.skipped++;
                logSkip(row.accountId, `expected one active Orb subscription, found ${subscriptions.length}`);
                continue;
            }

            const [subscription] = subscriptions;
            if (!subscription) {
                throw new Error(`Active Orb subscription missing for account ${row.accountId}`);
            }
            const currentPlan = subscription.plan?.external_plan_id;
            if (currentPlan !== row.currentPlan) {
                summary.skipped++;
                logSkip(row.accountId, `Orb plan ${currentPlan || '(empty)'} does not match CSV current_plan ${row.currentPlan}`);
                continue;
            }
            if (currentPlan === planExternalId) {
                summary.skipped++;
                logSkip(row.accountId, `already on ${planExternalId}`);
                continue;
            }
            if (subscription.pending_subscription_change) {
                summary.skipped++;
                logSkip(row.accountId, `pending Orb plan change ${subscription.pending_subscription_change.id} already exists`);
                continue;
            }

            const futureChange = await getFutureScheduledPlanChange(subscription.id, client, new Date());
            if (futureChange) {
                summary.skipped++;
                logSkip(
                    row.accountId,
                    `Orb has a future plan change to ${futureChange.plan?.external_plan_id || '(unknown plan)'} starting ${futureChange.start_date}`
                );
                continue;
            }

            if (!execute) {
                summary.dryRun++;
                console.log(`DRY RUN account ${row.accountId}: would schedule ${currentPlan} -> ${planExternalId} at end of term`);
                continue;
            }

            if (hasAttemptedSchedule) {
                await sleep(throttleMs);
            }
            hasAttemptedSchedule = true;
            await client.subscriptions.schedulePlanChange(subscription.id, {
                change_option: 'end_of_subscription_term',
                auto_collection: true,
                external_plan_id: planExternalId
            });
            summary.scheduled++;
            console.log(`SCHEDULED account ${row.accountId}: ${currentPlan} -> ${planExternalId} at end of term`);
        } catch (err) {
            summary.failed++;
            const message = err instanceof Error ? err.message : String(err);
            console.log(`FAILED account ${row.accountId}: ${message}`);
        }
    }

    console.log(`Summary: dry-run=${summary.dryRun}, scheduled=${summary.scheduled}, skipped=${summary.skipped}, failed=${summary.failed}`);
    return summary;
}

async function main(): Promise<void> {
    const { inputPath, execute, throttleMs } = parseArgs(process.argv.slice(2));
    const apiKey = process.env['ORB_API_KEY'];
    if (!apiKey) {
        throw new Error('ORB_API_KEY is not set');
    }

    const rows = parseMigrationCsv(await readFile(inputPath, 'utf8'));
    console.log(`Loaded ${rows.length} CSV row(s).`);
    if (!execute) {
        console.log('Dry-run only. Review the output, then rerun with --execute to schedule eligible migrations.');
    }

    const client = new Orb({ apiKey });
    const summary = await scheduleMigrations({ client, rows, execute, throttleMs });
    if (summary.failed > 0) {
        process.exitCode = 1;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    void main().catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
    });
}
