import fs from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { localFileService, remoteFileService } from '@nangohq/shared';

import { readFunctionSource } from './getCode.js';

vi.mock('@nangohq/shared', () => ({
    configService: {},
    functionConfigService: {},
    functionLookupService: {},
    functionSourceFile: vi.fn(),
    getCatalogTool: vi.fn(),
    getSyncConfigById: vi.fn(),
    localFileService: { checkForIntegrationSourceFile: vi.fn() },
    onEventScriptService: {},
    remoteFileService: { getFile: vi.fn() }
}));

describe('readFunctionSource', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('returns Ok(null) when no local source file is found', async () => {
        vi.spyOn(localFileService, 'checkForIntegrationSourceFile').mockReturnValue({ result: false, path: '' });

        const result = await readFunctionSource({ kind: 'local', path: 'github/actions/users.ts' });
        expect(result.unwrap()).toBeNull();
    });

    it('returns Err when the local source file cannot be read', async () => {
        const error = new Error('Permission denied');
        vi.spyOn(localFileService, 'checkForIntegrationSourceFile').mockReturnValue({ result: true, path: '/users.ts' });
        vi.spyOn(fs.promises, 'readFile').mockRejectedValue(error);

        const result = await readFunctionSource({ kind: 'local', path: 'github/actions/users.ts' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) expect(result.error).toBe(error);
    });

    it('returns Err when remote source loading fails', async () => {
        const error = new Error('Remote storage unavailable');
        vi.spyOn(remoteFileService, 'getFile').mockRejectedValue(error);

        const result = await readFunctionSource({ kind: 'remote', path: 'remote/users.ts' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) expect(result.error).toBe(error);
    });
});
