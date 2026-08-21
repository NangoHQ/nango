import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { envs as logsEnvs } from '../env.js';
import * as modelMessages from '../models/messages.js';
import * as modelOperations from '../models/operations.js';
import { LogsDisabledError, LogsNotFoundError } from '../utils.js';
import { logsOperationsService } from './operations.service.js';

import type { GetLogOperationParams, ListLogOperationsParams } from './operations.service.js';
import type { MessageRow, OperationRow } from '@nangohq/types';

describe('logsOperationsService', () => {
    const previousLogsEnabled = logsEnvs.NANGO_LOGS_ENABLED;

    beforeEach(() => {
        logsEnvs.NANGO_LOGS_ENABLED = true;
    });

    afterEach(() => {
        logsEnvs.NANGO_LOGS_ENABLED = previousLogsEnabled;
        vi.restoreAllMocks();
    });

    it('returns LogsDisabledError when logs are disabled', async () => {
        logsEnvs.NANGO_LOGS_ENABLED = false;
        const listOperationsSpy = vi.spyOn(modelOperations, 'listOperations');

        const result = await logsOperationsService.listOperations(baseParams());

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('expected listOperations to fail');
        }
        expect(result.error).toBeInstanceOf(LogsDisabledError);
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

    it('returns LogsDisabledError when getting an operation and logs are disabled', async () => {
        logsEnvs.NANGO_LOGS_ENABLED = false;
        const getOperationSpy = vi.spyOn(modelOperations, 'getOperation');

        const result = await logsOperationsService.getOperation(baseGetParams());

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('expected getOperation to fail');
        }
        expect(result.error).toBeInstanceOf(LogsDisabledError);
        expect(getOperationSpy).not.toHaveBeenCalled();
    });

    it('gets one operation with messages', async () => {
        const operation = makeOperation('op-1');
        const messages = [makeMessage('msg-1', operation.id)];
        const rawMessages = {
            count: 1,
            items: messages,
            cursorAfter: 'cursor-after',
            cursorBefore: 'cursor-before'
        } satisfies Awaited<ReturnType<typeof modelMessages.listMessages>>;
        const getOperationSpy = vi.spyOn(modelOperations, 'getOperation').mockResolvedValue(operation);
        const listMessagesSpy = vi.spyOn(modelMessages, 'listMessages').mockResolvedValue(rawMessages);
        const params = baseGetParams();

        const result = await logsOperationsService.getOperation(params);

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw result.error;
        }
        expect(getOperationSpy).toHaveBeenCalledWith({ id: params.operationId });
        expect(listMessagesSpy).toHaveBeenCalledWith({
            parentId: params.operationId,
            limit: params.messages.limit,
            search: params.messages.search,
            cursorAfter: params.messages.cursor,
            period: params.messages.period
        });
        expect(result.value).toStrictEqual({
            operation,
            messages,
            pagination: {
                total: rawMessages.count,
                cursor: rawMessages.cursorAfter
            }
        });
    });

    it('returns LogsNotFoundError when the operation belongs to another environment', async () => {
        vi.spyOn(modelOperations, 'getOperation').mockResolvedValue({ ...makeOperation('op-1'), environmentId: 999 });
        const listMessagesSpy = vi.spyOn(modelMessages, 'listMessages');

        const result = await logsOperationsService.getOperation(baseGetParams());

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('expected getOperation to fail');
        }
        expect(result.error).toBeInstanceOf(LogsNotFoundError);
        expect(listMessagesSpy).not.toHaveBeenCalled();
    });

    it('returns LogsNotFoundError when the operation does not exist', async () => {
        const error = new LogsNotFoundError();
        vi.spyOn(modelOperations, 'getOperation').mockRejectedValue(error);
        const listMessagesSpy = vi.spyOn(modelMessages, 'listMessages');

        const result = await logsOperationsService.getOperation(baseGetParams());

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('expected getOperation to fail');
        }
        expect(result.error).toBe(error);
        expect(listMessagesSpy).not.toHaveBeenCalled();
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

function baseGetParams(): GetLogOperationParams {
    return {
        accountId: 1,
        environmentId: 2,
        operationId: 'op-1',
        messages: {
            limit: 10,
            cursor: 'cursor-in',
            search: 'needle',
            period: {
                from: '2026-01-01T00:00:00.000Z',
                to: '2026-01-02T00:00:00.000Z'
            }
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

function makeMessage(id: string, parentId: string): MessageRow {
    return {
        id,
        source: 'user',
        level: 'info',
        type: 'log',
        message: `Message ${id}`,
        parentId,
        accountId: 1,
        createdAt: '2026-01-01T00:00:00.000Z'
    };
}
