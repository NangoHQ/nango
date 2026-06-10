import { Sandbox as E2B } from 'e2b';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRunningE2BSandboxCount } from './e2b.js';

describe('E2B provider helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('counts all running sandboxes from the E2B paginator', async () => {
        const pages = [[{ sandboxId: 'sandbox-1' }, { sandboxId: 'sandbox-2' }], [{ sandboxId: 'sandbox-3' }]];
        let pageIndex = 0;
        const paginator = {
            get hasNext() {
                return pageIndex < pages.length;
            },
            nextItems: vi.fn(() => Promise.resolve(pages[pageIndex++] ?? []))
        };
        const list = vi.spyOn(E2B, 'list').mockReturnValue(paginator as unknown as ReturnType<typeof E2B.list>);

        const count = await getRunningE2BSandboxCount({ apiKey: 'e2b-key', requestTimeoutMs: 5_000 });

        expect(count).toBe(3);
        expect(list).toHaveBeenCalledWith({
            apiKey: 'e2b-key',
            requestTimeoutMs: 5_000,
            query: { state: ['running'] }
        });
        expect(paginator.nextItems).toHaveBeenCalledTimes(2);
    });
});
