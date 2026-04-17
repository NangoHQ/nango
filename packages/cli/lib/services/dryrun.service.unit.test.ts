import { afterEach, describe, expect, it, vi } from 'vitest';

import { DryRunService } from './dryrun.service.js';

describe('DryRunService', () => {
    const originalExitCode = process.exitCode;

    afterEach(() => {
        process.exitCode = originalExitCode;
        vi.restoreAllMocks();
    });

    it('sets a failing exit code when setup validation fails', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        process.exitCode = undefined;

        const service = new DryRunService({ fullPath: '.', validation: false });

        await service.run({});

        expect(process.exitCode).toBe(1);
    });
});
