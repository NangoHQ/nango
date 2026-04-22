import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { DBSyncConfig } from '@nangohq/types';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nango-local-roundtrip-'));
process.env['NANGO_INTEGRATIONS_FULL_PATH'] = TMP_ROOT;

const { default: localFileService } = await import('./local.service.js');
const { resolveLocalFileName } = await import('../../utils/utils.js');

afterAll(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
    for (const entry of fs.readdirSync(TMP_ROOT)) {
        fs.rmSync(path.join(TMP_ROOT, entry), { recursive: true, force: true });
    }
});

describe('LocalFileService round-trip (master API)', () => {
    // These tests pin the write→read contract on master.
    // After Phase 2 adds `uploadCompiledJs` / `getCompiledJs` / `uploadTsSource` / `getFunctionTsCode`,
    // this file will grow with the domain-method spellings asserting the same contract.

    it('compiled JS round-trip via putIntegrationFile → getIntegrationFile', () => {
        const syncName = 'my-sync';
        const providerConfigKey = 'github';
        const fileName = resolveLocalFileName({ syncName, providerConfigKey });

        expect(fileName).toBe('my-sync-github.js');

        const putOk = localFileService.putIntegrationFile({ fileName, fileContent: 'const compiled = 1;' });
        expect(putOk).toBe(true);

        const readBack = localFileService.getIntegrationFile({
            syncConfig: { sync_name: syncName } as DBSyncConfig,
            providerConfigKey
        });
        expect(readBack).toBe('const compiled = 1;');
    });

    it('TS source round-trip via putIntegrationFile (nested) → fs.readFileSync', () => {
        const providerConfigKey = 'github';
        const scriptName = 'getUsers';
        const nestedName = `${providerConfigKey}/syncs/${scriptName}.ts`;

        const ok = localFileService.putIntegrationFile({ fileName: nestedName, fileContent: 'export default async () => 42;' });
        expect(ok).toBe(true);

        const expectedPath = path.join(TMP_ROOT, nestedName);
        expect(fs.readFileSync(expectedPath, 'utf8')).toBe('export default async () => 42;');
    });

    it('nango.yaml round-trip', () => {
        const ok = localFileService.putIntegrationFile({ fileName: 'nango.yaml', fileContent: 'models:\n  User: {}' });
        expect(ok).toBe(true);
        expect(fs.readFileSync(path.join(TMP_ROOT, 'nango.yaml'), 'utf8')).toBe('models:\n  User: {}');
    });
});

describe('LocalFileService round-trip (domain API)', () => {
    it('uploadCompiledJs → getCompiledJs round-trip; returns the resolved local path (no more _LOCAL_FILE_ sentinel)', async () => {
        const coords = { env: 'test', accountId: 1, environmentId: 2, configId: 3, providerConfigKey: 'gh' };
        const script = { scriptName: 'my-sync', scriptType: 'sync' as const, version: '1.0.0' };

        const location = await localFileService.uploadCompiledJs({ content: 'compiled-body', coords, script });
        expect(location).toBe(path.join(TMP_ROOT, 'my-sync-gh.js'));
        expect(location).not.toBe('_LOCAL_FILE_');

        const readBack = await localFileService.getCompiledJs({
            syncConfig: { sync_name: 'my-sync' } as DBSyncConfig,
            providerConfigKey: 'gh'
        });
        expect(readBack).toBe('compiled-body');
    });

    it('uploadTsSource → getFunctionTsCode round-trip (nested path); returns the resolved local path', async () => {
        const coords = { env: 'test', accountId: 1, environmentId: 2, configId: 3, providerConfigKey: 'gh' };
        const script = { scriptName: 'getUsers', scriptType: 'sync' as const };

        const location = await localFileService.uploadSourceTs({ content: 'ts-body', coords, script });
        expect(location).toBe(path.join(TMP_ROOT, 'gh/syncs/getUsers.ts'));

        const readBack = await localFileService.getSourceTs({
            syncConfig: { sync_name: 'getUsers', type: 'sync' } as DBSyncConfig,
            providerConfigKey: 'gh'
        });
        expect(readBack).toBe('ts-body');
    });

    it('uploadNangoYaml writes to nango.yaml at base path and returns the resolved path', async () => {
        const coords = { env: 'test', accountId: 1, environmentId: 2 };
        const location = await localFileService.uploadNangoYaml({ content: 'models: {}', coords });
        expect(location).toBe(path.join(TMP_ROOT, 'nango.yaml'));
        expect(fs.readFileSync(path.join(TMP_ROOT, 'nango.yaml'), 'utf8')).toBe('models: {}');
    });

    it('deleteDeployedFiles is a no-op in local mode', async () => {
        fs.writeFileSync(path.join(TMP_ROOT, 'persistent.js'), 'stay');
        await localFileService.deleteDeployedFiles(['persistent.js', '/any/other/key']);
        expect(fs.readFileSync(path.join(TMP_ROOT, 'persistent.js'), 'utf8')).toBe('stay');
    });
});
