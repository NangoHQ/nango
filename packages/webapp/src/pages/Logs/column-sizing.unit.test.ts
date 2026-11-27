import { describe, expect, it } from 'vitest';

import { computeLogsGridTemplate } from './column-sizing.js';

import type { SearchOperationsData } from '@nangohq/types';

const now = new Date('2026-11-27T15:00:00');

function row(overrides: Partial<SearchOperationsData>): SearchOperationsData {
    return {
        createdAt: '2026-11-27T14:29:22',
        operation: { type: 'action', action: 'run' },
        integrationName: null,
        syncConfigName: null,
        connectionName: null,
        ...overrides
    } as SearchOperationsData;
}

const tracks = (template: string) => template.split(' ');

describe('computeLogsGridTemplate', () => {
    it('has seven columns, with Connection last', () => {
        const template = tracks(computeLogsGridTemplate([row({})], { panelOpen: false, now }));
        expect(template).toHaveLength(7);
        expect(template[6]).toBe('minmax(100px,100px)');
    });

    it('drops Integration and Connection while the panel is open', () => {
        const template = tracks(computeLogsGridTemplate([row({ integrationName: 'github', connectionName: 'abc' })], { panelOpen: true, now }));
        expect(template).toHaveLength(5);
        expect(template[4]).toBe('minmax(64px,1fr)');
    });

    it('fits Type to its longest label with the panel closed', () => {
        const template = tracks(
            computeLogsGridTemplate([row({ operation: { type: 'agent_session', action: 'tool_search' } } as Partial<SearchOperationsData>)], {
                panelOpen: false,
                now
            })
        );
        expect(template[3]).toBe(`${Math.ceil('Agent session tool search'.length * 7.2) + 20}px`);
    });

    it('fits Type to its content while the panel is open, so Function gets the spare width', () => {
        const short = tracks(computeLogsGridTemplate([row({})], { panelOpen: true, now }))[3];
        const long = tracks(
            computeLogsGridTemplate([row({}), row({ operation: { type: 'sync', action: 'pause' } } as Partial<SearchOperationsData>)], { panelOpen: true, now })
        )[3];
        expect(short).toMatch(/^minmax\(64px,\d+px\)$/);
        expect(parseInt(long?.split(',')[1] ?? '')).toBeGreaterThan(parseInt(short?.split(',')[1] ?? ''));
    });

    it('lets a dated timestamp shrink to the time-only width while the panel is open', () => {
        const template = tracks(computeLogsGridTemplate([row({ createdAt: '2026-11-25T09:00:00' })], { panelOpen: true, now }));
        expect(template[0]).toMatch(/^minmax\(91px,\d+px\)$/);
    });

    it('keeps the timestamp column wide enough for its header with no rows', () => {
        expect(tracks(computeLogsGridTemplate([], { panelOpen: false, now }))[0]).toBe(
            tracks(computeLogsGridTemplate([row({})], { panelOpen: false, now }))[0]
        );
    });

    it('widens the timestamp column when a row is not from today', () => {
        const today = parseInt(tracks(computeLogsGridTemplate([row({})], { panelOpen: false, now }))[0] ?? '');
        const older = parseInt(tracks(computeLogsGridTemplate([row({}), row({ createdAt: '2026-11-25T09:00:00' })], { panelOpen: false, now }))[0] ?? '');
        expect(older).toBeGreaterThan(today);
    });

    it('fits a full UUID connection ID, and caps a longer one at 320px', () => {
        const uuid = tracks(computeLogsGridTemplate([row({ connectionName: '4504f681-7dd1-47be-a43c-d9b9a8ec3cae' })], { panelOpen: false, now }))[6];
        expect(uuid).toBe(`minmax(100px,${Math.ceil(36 * 7.6) + 30}px)`);
        const long = tracks(computeLogsGridTemplate([row({ connectionName: 'x'.repeat(80) })], { panelOpen: false, now }))[6];
        expect(long).toBe('minmax(100px,320px)');
    });

    it('fits Integration to its content and gives Function the spare width', () => {
        const template = tracks(computeLogsGridTemplate([row({ integrationName: 'a' })], { panelOpen: false, now }));
        expect(template.slice(4, 6)).toEqual(['minmax(0,120px)', 'minmax(120px,1fr)']);
    });
});
