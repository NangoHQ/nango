import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Nango } from './index.js';

describe('triggerSync', () => {
    const nango = new Nango({ secretKey: 'test' });
    const mockHttp = {
        post: vi.fn()
    };
    // @ts-expect-error - we're mocking the http instance
    nango.http = mockHttp;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle sync_mode as a string', async () => {
        await nango.triggerSync('test-provider', ['test-sync'], undefined, 'full_refresh');

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: undefined,
                sync_mode: 'full_refresh'
            },
            expect.any(Object)
        );
    });

    it('should handle sync_mode as a boolean (true)', async () => {
        await nango.triggerSync('test-provider', ['test-sync'], undefined, true);

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: undefined,
                sync_mode: 'full_refresh'
            },
            expect.any(Object)
        );
    });

    it('should handle sync_mode as a boolean (false)', async () => {
        await nango.triggerSync('test-provider', ['test-sync'], undefined, false);

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: undefined,
                sync_mode: 'incremental'
            },
            expect.any(Object)
        );
    });

    it('should default to incremental sync_mode when not provided', async () => {
        await nango.triggerSync('test-provider', ['test-sync']);

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: undefined,
                sync_mode: 'incremental'
            },
            expect.any(Object)
        );
    });
});
