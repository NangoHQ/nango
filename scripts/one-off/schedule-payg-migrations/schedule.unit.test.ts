import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseMigrationCsv } from './csv.js';
import { DEFAULT_THROTTLE_MS, parseArgs } from './schedule.js';

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
    it('validates and retains the growth add-on value', () => {
        expect(
            parseMigrationCsv(
                'account_id,current_plan,with_growth_addon,migration_date,override_scheduled_plan_change\n123,"growth, legacy",true,2026-10-15,true\n'
            )
        ).toEqual([
            {
                accountId: '123',
                currentPlan: 'growth, legacy',
                withGrowthAddon: true,
                migrationDate: '2026-10-15',
                overrideScheduledPlanChange: true
            }
        ]);
        expect(parseMigrationCsv('account_id,current_plan,with_growth_addon,migration_date,override_scheduled_plan_change\n123,growth,false,,false\n')).toEqual(
            [{ accountId: '123', currentPlan: 'growth', withGrowthAddon: false, migrationDate: null, overrideScheduledPlanChange: false }]
        );
    });

    it('rejects duplicate IDs and invalid add-on booleans', () => {
        expect(() =>
            parseMigrationCsv(
                'account_id,current_plan,with_growth_addon,migration_date,override_scheduled_plan_change\n123,growth,false,,false\n123,starter,true,,false\n'
            )
        ).toThrow('duplicates account_id');
        expect(() =>
            parseMigrationCsv('account_id,current_plan,with_growth_addon,migration_date,override_scheduled_plan_change\n123,growth,yes,,false\n')
        ).toThrow('invalid with_growth_addon');
        expect(() =>
            parseMigrationCsv('account_id,current_plan,with_growth_addon,migration_date,override_scheduled_plan_change\n123,growth,false,2026-02-29,false\n')
        ).toThrow('invalid migration_date');
        expect(() =>
            parseMigrationCsv('account_id,current_plan,with_growth_addon,migration_date,override_scheduled_plan_change\n123,growth,false,,yes\n')
        ).toThrow('invalid override_scheduled_plan_change');
    });
});
