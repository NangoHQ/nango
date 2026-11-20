import { describe, expect, it, vi } from 'vitest';

import type * as Utils from '@nangohq/utils';

vi.mock('@nangohq/utils', async (importOriginal) => {
    const utils = await importOriginal<typeof Utils>();
    return {
        ...utils,
        parseEnvs: vi.fn(utils.parseEnvs)
    };
});

describe('Runner client entry point', () => {
    it('does not parse environment configuration when imported', async () => {
        vi.resetModules();
        const { parseEnvs } = await import('@nangohq/utils');
        vi.mocked(parseEnvs).mockClear();

        await import('./client.js');

        expect(parseEnvs).not.toHaveBeenCalled();
    });
});
