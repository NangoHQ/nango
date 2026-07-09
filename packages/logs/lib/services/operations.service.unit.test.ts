import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { envs as logsEnvs } from '../env.js';
import * as modelMessages from '../models/messages.js';
import * as modelOperations from '../models/operations.js';
import { logsDisabledErrorMessage, logsOperationsService } from './operations.service.js';

import type { ListLogOperationsParams } from './operations.service.js';
import type { OperationRow } from '@nangohq/types';

describe('logsOperationsService', () => {
    const previousLogsEnabled = logsEnvs.NANGO_LOGS_ENABLED;

    beforeEach(() => {
        logsEnvs.NANGO_LOGS_ENABLED = true;
    });

    afterEach(() => {
        logsEnvs.NANGO_LOGS_ENABLED = previousLogsEnabled;
        vi.restoreAllMocks();
    });

    it('returns an error when logs are disabled', async () => {
        logsEnvs.NANGO_LOGS_ENABLED = false;
        const listOperationsSpy = vi.spyOn(modelOperations, 'listOperations');

        const result = await logsOperationsService.listOperations(baseParams());

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('expected listOperations to fail');
        }
        expect(result.error).toStrictEqual(new Error(logsDisabledErrorMessage));
        expect(listOperationsSpy).not.toHaveBeenCalled();
    });

    it('lists operations with the provided params', async () => {
        const operations = [makeOperation('op-1'), makeOperation('op-2')];
        const rawOperations = { count: 10, items: operations, cursor: 'cursor-next' } satisfies Awaited<ReturnType<typeof modelOperations.listOperations>>;
        const listOperationsSpy = vi.spyOn(modelOperations, 'listOperations').mockResolvedValue(rawOperations);
        const searchMessagesSpy = vi.spyOn(modelMessages, 'searchForMessagesInsideOperations');
        const params = baseParams();

        const result = await logsOperationsService.listOperations(params);

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw result.error;
        }
        expect(listOperationsSpy).toHaveBeenCalledWith(params);
        expect(searchMessagesSpy).not.toHaveBeenCalled();
        expect(result.value).toStrictEqual({
            operations,
            pagination: {
                total: rawOperations.count,
                cursor: rawOperations.cursor
            }
        });
    });

    it('filters operations by matching messages when search is provided', async () => {
        const operations = [makeOperation('op-1'), makeOperation('op-2'), makeOperation('op-3')];
        vi.spyOn(modelOperations, 'listOperations').mockResolvedValue({ count: 10, items: operations, cursor: null });
        const searchMessagesSpy = vi.spyOn(modelMessages, 'searchForMessagesInsideOperations').mockResolvedValue({ items: [{ key: 'op-2', doc_count: 2 }] });

        const result = await logsOperationsService.listOperations({ ...baseParams(), search: 'needle' });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw result.error;
        }
        expect(searchMessagesSpy).toHaveBeenCalledWith({ search: 'needle', operationsIds: ['op-1', 'op-2', 'op-3'] });
        expect(result.value).toStrictEqual({
            operations: [operations[1]],
            pagination: {
                total: 1,
                cursor: null
            }
        });
    });

    it('returns a cursor when the searched operation page has more results but no message matches', async () => {
        const op1 = makeOperation('op-1');
        const op2 = makeOperation('op-2');
        const listOperationsSpy = vi.spyOn(modelOperations, 'listOperations').mockResolvedValue({ count: 10, items: [op1, op2], cursor: 'cursor-page-2' });
        const searchMessagesSpy = vi.spyOn(modelMessages, 'searchForMessagesInsideOperations').mockResolvedValue({ items: [] });
        const params = { ...baseParams(), limit: 2, search: 'needle' };

        const result = await logsOperationsService.listOperations(params);

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw result.error;
        }
        expect(listOperationsSpy).toHaveBeenCalledTimes(1);
        expect(listOperationsSpy).toHaveBeenCalledWith({ ...baseParams(), limit: 2 });
        expect(searchMessagesSpy).toHaveBeenCalledWith({ search: 'needle', operationsIds: ['op-1', 'op-2'] });
        expect(result.value).toStrictEqual({
            operations: [],
            pagination: {
                total: 0,
                cursor: 'cursor-page-2'
            }
        });
    });

    it('does not search messages when no operations are returned', async () => {
        vi.spyOn(modelOperations, 'listOperations').mockResolvedValue({ count: 0, items: [], cursor: null });
        const searchMessagesSpy = vi.spyOn(modelMessages, 'searchForMessagesInsideOperations');

        const result = await logsOperationsService.listOperations({ ...baseParams(), search: 'needle' });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw result.error;
        }
        expect(searchMessagesSpy).not.toHaveBeenCalled();
        expect(result.value).toStrictEqual({
            operations: [],
            pagination: {
                total: 0,
                cursor: null
            }
        });
    });

    it('returns message search errors', async () => {
        const error = new Error('message search failed');
        vi.spyOn(modelOperations, 'listOperations').mockResolvedValue({ count: 1, items: [makeOperation('op-1')], cursor: null });
        vi.spyOn(modelMessages, 'searchForMessagesInsideOperations').mockRejectedValue(error);

        const result = await logsOperationsService.listOperations({ ...baseParams(), search: 'needle' });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('expected listOperations to fail');
        }
        expect(result.error).toBe(error);
    });

    it('returns model errors', async () => {
        const error = new Error('model failed');
        vi.spyOn(modelOperations, 'listOperations').mockRejectedValue(error);

        const result = await logsOperationsService.listOperations(baseParams());

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('expected listOperations to fail');
        }
        expect(result.error).toBe(error);
    });
});

function baseParams(): ListLogOperationsParams {
    return {
        accountId: 1,
        environmentId: 2,
        limit: 25,
        cursor: 'cursor-in',
        states: ['success'],
        types: ['sync:run'],
        integrations: ['github'],
        connections: ['github-connection'],
        syncs: ['github-sync'],
        period: {
            from: '2026-01-01T00:00:00.000Z',
            to: '2026-01-02T00:00:00.000Z'
        }
    };
}

function makeOperation(id: string): OperationRow {
    return {
        id,
        source: 'internal',
        level: 'info',
        type: 'operation',
        message: `Operation ${id}`,
        operation: { type: 'sync', action: 'run' },
        state: 'success',
        accountId: 1,
        accountName: 'Account',
        environmentId: 2,
        environmentName: 'dev',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        startedAt: '2026-01-01T00:00:00.000Z',
        endedAt: '2026-01-01T00:01:00.000Z',
        expiresAt: '2026-01-08T00:00:00.000Z'
    };
}
