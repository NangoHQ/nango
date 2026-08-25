import { describe, expect, it } from 'vitest';

import { getLogsUrl } from './logs.js';

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
