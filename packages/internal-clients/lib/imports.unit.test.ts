import { describe, expect, it, vi } from 'vitest';

import type * as Utils from '@nangohq/utils';

vi.mock('@nangohq/utils', async (importOriginal) => {
    const utils = await importOriginal<typeof Utils>();
    return { ...utils, parseEnvs: vi.fn(utils.parseEnvs) };
});

describe('Internal client entry points', () => {
    it('does not parse environment configuration when imported', async () => {
        vi.resetModules();
        const { parseEnvs } = await import('@nangohq/utils');
        vi.mocked(parseEnvs).mockClear();

        await import('./jobs.js');
        await import('./persist.js');

        expect(parseEnvs).not.toHaveBeenCalled();
    });
});
