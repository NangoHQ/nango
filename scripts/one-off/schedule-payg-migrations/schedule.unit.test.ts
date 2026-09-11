import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseMigrationCsv } from './csv.js';
import { DEFAULT_THROTTLE_MS, parseArgs, scheduleMigrations } from './schedule.js';

function listResult<T>(items: T[]) {
    return (async function* () {
        yield* await Promise.resolve(items);
    })();
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('pay-as-you-go migration arguments', () => {
    it('accepts a CSV path and optional execution settings', () => {
        expect(parseArgs(['./customers.csv'])).toEqual({ inputPath: './customers.csv', execute: false, throttleMs: DEFAULT_THROTTLE_MS });
        expect(parseArgs(['./customers.csv', '--execute', '--throttle-ms=500'])).toEqual({
            inputPath: './customers.csv',
            execute: true,
            throttleMs: 500
        });
    });

    it('rejects unexpected or incomplete arguments', () => {
        expect(() => parseArgs([])).toThrow('Usage:');
        expect(() => parseArgs(['./customers.csv', './another.csv'])).toThrow('Usage:');
        expect(() => parseArgs(['./customers.csv', '--force'])).toThrow('Usage:');
        expect(() => parseArgs(['./customers.csv', '--throttle-ms=-1'])).toThrow('non-negative integer');
        expect(() => parseArgs(['./customers.csv', '--throttle-ms='])).toThrow('non-negative integer');
    });
});

describe('pay-as-you-go migration CSV', () => {
    it('validates the required shape while ignoring the growth add-on value afterward', () => {
        expect(parseMigrationCsv('account_id,current_plan,with_growth_addon\n123,"growth, legacy",true\n')).toEqual([
            { accountId: '123', currentPlan: 'growth, legacy' }
        ]);
    });

    it('rejects duplicate IDs and invalid add-on booleans', () => {
        expect(() => parseMigrationCsv('account_id,current_plan,with_growth_addon\n123,growth,false\n123,starter,true\n')).toThrow('duplicates account_id');
        expect(() => parseMigrationCsv('account_id,current_plan,with_growth_addon\n123,growth,yes\n')).toThrow('invalid with_growth_addon');
    });
});

describe('pay-as-you-go migration scheduling', () => {
    const rows = [{ accountId: '123', currentPlan: 'growth-legacy' }];

    it('reports eligible accounts in dry-run mode without calling Orb to schedule them', async () => {
        const schedulePlanChange = vi.fn();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const summary = await scheduleMigrations({
            client: {
                subscriptions: {
                    list: vi
                        .fn()
                        .mockReturnValue(
                            listResult([{ id: 'sub_123', customer: { external_customer_id: '123' }, plan: { external_plan_id: 'growth-legacy' } }])
                        ),
                    fetchSchedule: vi.fn().mockReturnValue(listResult([])),
                    schedulePlanChange
                }
            },
            rows,
            execute: false
        });

        expect(summary).toEqual({ dryRun: 1, scheduled: 0, skipped: 0, failed: 0 });
        expect(schedulePlanChange).not.toHaveBeenCalled();
    });

    it('skips a mismatched plan and an existing pending change', async () => {
        const list = vi
            .fn()
            .mockReturnValueOnce(listResult([{ id: 'sub_wrong', customer: { external_customer_id: '123' }, plan: { external_plan_id: 'starter-legacy' } }]))
            .mockReturnValueOnce(
                listResult([
                    {
                        id: 'sub_pending',
                        customer: { external_customer_id: '123' },
                        plan: { external_plan_id: 'growth-legacy' },
                        pending_subscription_change: { id: 'change_123' }
                    }
                ])
            );
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const client = { subscriptions: { list, fetchSchedule: vi.fn().mockReturnValue(listResult([])), schedulePlanChange: vi.fn() } };

        await scheduleMigrations({ client, rows, execute: false });
        const summary = await scheduleMigrations({ client, rows, execute: false });

        expect(summary).toEqual({ dryRun: 0, scheduled: 0, skipped: 1, failed: 0 });
        expect(client.subscriptions.schedulePlanChange).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(expect.stringContaining('pending Orb plan change'));
    });

    it('sends the end-of-term change payload when execution is enabled', async () => {
        const schedulePlanChange = vi.fn().mockResolvedValue({});
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const summary = await scheduleMigrations({
            client: {
                subscriptions: {
                    list: vi
                        .fn()
                        .mockReturnValue(
                            listResult([{ id: 'sub_123', customer: { external_customer_id: '123' }, plan: { external_plan_id: 'growth-legacy' } }])
                        ),
                    fetchSchedule: vi.fn().mockReturnValue(listResult([])),
                    schedulePlanChange
                }
            },
            rows,
            execute: true,
            throttleMs: 0
        });

        expect(summary).toEqual({ dryRun: 0, scheduled: 1, skipped: 0, failed: 0 });
        expect(schedulePlanChange).toHaveBeenCalledWith('sub_123', {
            change_option: 'end_of_subscription_term',
            auto_collection: true,
            external_plan_id: 'pay-as-you-go'
        });
    });

    it('looks up multiple accounts in one Orb request', async () => {
        const list = vi.fn().mockReturnValue(
            listResult([
                { id: 'sub_123', customer: { external_customer_id: '123' }, plan: { external_plan_id: 'growth-legacy' } },
                { id: 'sub_456', customer: { external_customer_id: '456' }, plan: { external_plan_id: 'starter-legacy' } }
            ])
        );

        const summary = await scheduleMigrations({
            client: { subscriptions: { list, fetchSchedule: vi.fn().mockReturnValue(listResult([])), schedulePlanChange: vi.fn() } },
            rows: [
                { accountId: '123', currentPlan: 'growth-legacy' },
                { accountId: '456', currentPlan: 'starter-legacy' }
            ],
            execute: false
        });

        expect(summary).toEqual({ dryRun: 2, scheduled: 0, skipped: 0, failed: 0 });
        expect(list).toHaveBeenCalledWith({ external_customer_id: ['123', '456'], status: 'active', limit: 100 });
    });

    it('waits between each Orb schedule request', async () => {
        const schedulePlanChange = vi.fn().mockResolvedValue({});
        vi.useFakeTimers();
        const scheduling = scheduleMigrations({
            client: {
                subscriptions: {
                    list: vi.fn().mockReturnValue(
                        listResult([
                            { id: 'sub_123', customer: { external_customer_id: '123' }, plan: { external_plan_id: 'growth-legacy' } },
                            { id: 'sub_456', customer: { external_customer_id: '456' }, plan: { external_plan_id: 'starter-legacy' } }
                        ])
                    ),
                    fetchSchedule: vi.fn().mockReturnValue(listResult([])),
                    schedulePlanChange
                }
            },
            rows: [
                { accountId: '123', currentPlan: 'growth-legacy' },
                { accountId: '456', currentPlan: 'starter-legacy' }
            ],
            execute: true,
            throttleMs: 250
        });

        await vi.runAllTimersAsync();
        await scheduling;

        expect(schedulePlanChange).toHaveBeenCalledTimes(2);
    });

    it('skips an end-of-term plan change already present in Orb’s subscription schedule', async () => {
        const schedulePlanChange = vi.fn();
        const fetchSchedule = vi.fn().mockReturnValue(
            listResult([
                { start_date: '2000-09-01T00:00:00Z', plan: { external_plan_id: 'growth-v2' } },
                { start_date: '2999-10-01T00:00:00Z', plan: { external_plan_id: 'free' } }
            ])
        );
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        const summary = await scheduleMigrations({
            client: {
                subscriptions: {
                    list: vi
                        .fn()
                        .mockReturnValue(listResult([{ id: 'sub_68', customer: { external_customer_id: '68' }, plan: { external_plan_id: 'growth-v2' } }])),
                    fetchSchedule,
                    schedulePlanChange
                }
            },
            rows: [{ accountId: '68', currentPlan: 'growth-v2' }],
            execute: true,
            throttleMs: 0
        });

        expect(summary).toEqual({ dryRun: 0, scheduled: 0, skipped: 1, failed: 0 });
        expect(fetchSchedule).toHaveBeenCalledWith('sub_68');
        expect(schedulePlanChange).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(expect.stringContaining('future plan change to free'));
    });
});
