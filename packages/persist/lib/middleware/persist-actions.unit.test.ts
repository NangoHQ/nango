import { describe, expect, it } from 'vitest';

import { TASK_CAPABILITY_ACTIONS } from '@nangohq/internal-auth';

import { persistActionForRequest } from './persist-actions.js';

describe('persistActionForRequest', () => {
    it('maps persist route families', () => {
        expect(persistActionForRequest({ method: 'POST', originalUrl: '/environment/1/log', path: '/log' })).toBe(TASK_CAPABILITY_ACTIONS.persistLog);
        expect(persistActionForRequest({ method: 'POST', originalUrl: '/environment/1/connection/2/sync/s/job/3/records', path: '/records' })).toBe(
            TASK_CAPABILITY_ACTIONS.persistRecords
        );
        expect(persistActionForRequest({ method: 'DELETE', originalUrl: '/environment/1/connection/2/sync/s/job/3/outdated', path: '/outdated' })).toBe(
            TASK_CAPABILITY_ACTIONS.persistRecords
        );
        expect(persistActionForRequest({ method: 'GET', originalUrl: '/environment/1/connection/2/cursor', path: '/cursor' })).toBe(
            TASK_CAPABILITY_ACTIONS.persistCursor
        );
        expect(persistActionForRequest({ method: 'PUT', originalUrl: '/environment/1/connection/2/checkpoint', path: '/checkpoint' })).toBe(
            TASK_CAPABILITY_ACTIONS.persistCheckpoint
        );
        expect(persistActionForRequest({ method: 'POST', originalUrl: '/environment/1/runner/locks/try-acquire', path: '/try-acquire' })).toBe(
            TASK_CAPABILITY_ACTIONS.persistLocks
        );
        expect(persistActionForRequest({ method: 'POST', originalUrl: '/environment/1/runner/telemetry', path: '/telemetry' })).toBe(
            TASK_CAPABILITY_ACTIONS.persistTelemetry
        );
        expect(persistActionForRequest({ method: 'PUT', originalUrl: '/environment/1/runner/task/t/abort', path: '/abort' })).toBe(
            TASK_CAPABILITY_ACTIONS.persistAbort
        );
        expect(persistActionForRequest({ method: 'PUT', originalUrl: '/environment/1/runner/sync-conflict', path: '/sync-conflict' })).toBe(
            TASK_CAPABILITY_ACTIONS.persistSyncConflict
        );
    });

    it('returns null for unknown paths', () => {
        expect(persistActionForRequest({ method: 'GET', originalUrl: '/health', path: '/health' })).toBeNull();
    });
});
