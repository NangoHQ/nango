import { describe, expect, it } from 'vitest';

import { isBillableDataTransfer } from './data-transfer-event.js';

describe('isBillableDataTransfer', () => {
    it.each([
        ['server', 'proxy'],
        ['server', 'get_/records'],
        ['server', 'webhook_forward'],
        ['runner', 'proxy'],
        ['runner', 'uncontrolled_fetch'],
        ['runner', 'persist_customer_logs'],
        ['runner', 'persist_records']
    ] as const)('accepts billable %s.%s traffic', (pkg, callsite) => {
        expect(isBillableDataTransfer(pkg, callsite)).toBe(true);
    });

    it.each([
        ['server', 'credential_test_hook'],
        ['server', 'connection_hook'],
        ['runner', 'persist_system_logs'],
        ['runner', 'persist_logs']
    ] as const)('excludes non-billable %s.%s traffic', (pkg, callsite) => {
        expect(isBillableDataTransfer(pkg, callsite)).toBe(false);
    });
});
