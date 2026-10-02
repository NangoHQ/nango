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
        expect(parseMigrationCsv('account_id,current_plan,with_growth_addon\n123,"growth, legacy",true\n')).toEqual([
            { accountId: '123', currentPlan: 'growth, legacy', withGrowthAddon: true }
        ]);
        expect(parseMigrationCsv('account_id,current_plan,with_growth_addon\n123,growth,false\n')).toEqual([
            { accountId: '123', currentPlan: 'growth', withGrowthAddon: false }
        ]);
    });

    it('rejects duplicate IDs and invalid add-on booleans', () => {
        expect(() => parseMigrationCsv('account_id,current_plan,with_growth_addon\n123,growth,false\n123,starter,true\n')).toThrow('duplicates account_id');
        expect(() => parseMigrationCsv('account_id,current_plan,with_growth_addon\n123,growth,yes\n')).toThrow('invalid with_growth_addon');
    });
});
