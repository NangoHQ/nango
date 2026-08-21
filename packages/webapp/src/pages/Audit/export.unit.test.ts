import { describe, expect, it } from 'vitest';

import { exportFilterLabel, exportWindowLabel } from './export';

describe('exportWindowLabel', () => {
    it('names both ends of a closed window', () => {
        expect(exportWindowLabel('2026-08-01T00:00:00.000Z', '2026-08-15T00:00:00.000Z')).toContain(' to ');
    });

    it('reads as open-ended when only the start is set', () => {
        expect(exportWindowLabel('2026-08-01T00:00:00.000Z', undefined)).toMatch(/^since /);
    });

    it('names the end when only that is set', () => {
        expect(exportWindowLabel(undefined, '2026-08-15T00:00:00.000Z')).toMatch(/^up to /);
    });

    it('says what an absent window actually means, rather than leaving it blank', () => {
        expect(exportWindowLabel(undefined, undefined)).toBe('the full retention window');
    });
});

describe('exportFilterLabel', () => {
    it('says all resources when nothing is filtered', () => {
        expect(exportFilterLabel([], [])).toBe('all resources');
    });

    it('lists the resources', () => {
        expect(exportFilterLabel(['connection', 'sync'], [])).toBe('connection, sync');
    });

    it('attaches the actions to the resource they narrow', () => {
        expect(exportFilterLabel(['connection'], ['created', 'deleted'])).toBe('connection (created, deleted)');
    });

    it('ignores actions with no resource, matching what the server would accept', () => {
        expect(exportFilterLabel([], ['created'])).toBe('all resources');
    });
});
