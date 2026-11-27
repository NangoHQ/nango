import { afterEach, describe, expect, it, vi } from 'vitest';

import { matchPresetFromPeriod } from './dates.js';
import { expandLogsTypes, getLogsUrl, liveDisplayPeriod, logsPresets } from './logs.js';

describe('liveDisplayPeriod', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    const labelAfter = (pickedAt: string, now: string, preset: string) => {
        vi.useFakeTimers({ now: new Date(pickedAt) });
        const picked = logsPresets.find((p) => p.name === preset)!.toPeriod()!;
        const stored = { from: picked.from, to: picked.to ?? new Date() };
        vi.setSystemTime(new Date(now));
        return matchPresetFromPeriod(liveDisplayPeriod(true, stored), logsPresets)?.name;
    };

    it('keeps a rolling preset after time passes', () => {
        expect(labelAfter('2026-11-27T10:00:00Z', '2026-11-27T10:30:00Z', 'last24h')).toBe('last24h');
    });

    it('keeps a start-of-day preset after time passes', () => {
        expect(labelAfter('2026-11-27T10:00:00Z', '2026-11-27T10:30:00Z', 'last3d')).toBe('last3d');
    });

    it('returns the stored window when paused', () => {
        const stored = { from: new Date('2026-11-26T10:00:00Z'), to: new Date('2026-11-27T10:00:00Z') };
        expect(liveDisplayPeriod(false, stored)).toBe(stored);
    });
});

describe('expandLogsTypes', () => {
    it.each(['tool', 'tool:call'] as const)('includes legacy actions when filtering by %s', (type) => {
        expect(expandLogsTypes([type])).toEqual([type, 'action:run']);
    });

    it('preserves other filters and avoids duplicate action filters', () => {
        expect(expandLogsTypes(['sync', 'tool', 'action:run'])).toEqual(['sync', 'tool', 'action:run']);
        expect(expandLogsTypes(['all'])).toEqual(['all']);
        expect(expandLogsTypes(['action'])).toEqual(['action']);
    });
});

describe('getLogsUrl', () => {
    it('omits undefined and null filter values', () => {
        const url = getLogsUrl({ env: 'dev', connections: undefined, types: null as any });
        expect(url).not.toContain('connections=');
        expect(url).not.toContain('types=');
    });

    it('omits empty string filter values', () => {
        const url = getLogsUrl({ env: 'dev', connections: '', integrations: '' });
        expect(url).not.toContain('connections=');
        expect(url).not.toContain('integrations=');
    });

    it('omits arrays of empty strings', () => {
        const url = getLogsUrl({ env: 'dev', types: ['', ''] as any });
        expect(url).not.toContain('types=');
    });

    it('filters empty strings out of mixed arrays', () => {
        const url = getLogsUrl({ env: 'dev', types: ['', 'action', ''] as any });
        expect(url).toContain('types=action');
        expect(url).not.toMatch(/types=,|types=.*,$/);
    });

    it('includes valid scalar filters', () => {
        const url = getLogsUrl({ env: 'dev', connections: 'conn-1', integrations: 'github' });
        expect(url).toContain('connections=conn-1');
        expect(url).toContain('integrations=github');
    });

    it('includes valid array filters joined by comma', () => {
        const url = getLogsUrl({ env: 'dev', types: ['action', 'sync'] as any });
        expect(url).toContain('types=action%2Csync');
    });

    it('includes operationId when set', () => {
        const url = getLogsUrl({ env: 'dev', operationId: 'op-123' });
        expect(url).toContain('operationId=op-123');
    });

    it('omits operationId when null', () => {
        const url = getLogsUrl({ env: 'dev', operationId: null });
        expect(url).not.toContain('operationId=');
    });

    it('uses the correct env in the path', () => {
        const url = getLogsUrl({ env: 'staging' });
        expect(url).toMatch(/^\/staging\/logs\?/);
    });

    it('sets live=false by default', () => {
        const url = getLogsUrl({ env: 'dev' });
        expect(url).toContain('live=false');
    });

    it('sets live=true when requested', () => {
        const url = getLogsUrl({ env: 'dev', live: true });
        expect(url).toContain('live=true');
    });
});
