import fs from 'node:fs';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { functionConfigService, localFileService, remoteFileService, seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

import type { DBOnEventScript, DBSyncConfig } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const route = '/api/v1/integrations/:providerConfigKey/functions/:functionName/code';

async function insertSyncConfig({
    environment_id,
    nango_config_id,
    sync_name,
    type
}: {
    environment_id: number;
    nango_config_id: number;
    sync_name: string;
    type: 'sync' | 'action' | 'on-event';
}) {
    const now = new Date();
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id,
        sync_name,
        type,
        file_location: 'file_location',
        nango_config_id,
        version: '0.0.0',
        source: 'repo',
        active: true,
        runs: 'runs',
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        enabled: true,
        created_at: now,
        updated_at: now,
        models: []
    });
}

async function insertOnEventScript({ config_id, name }: { config_id: number; name: string }) {
    const now = new Date();
    await db.knex.from<DBOnEventScript>('on_event_scripts').insert({
        config_id,
        name,
        file_location: 'file_location',
        version: '0.0.0',
        active: true,
        event: 'POST_CONNECTION_CREATION',
        sdk_version: null,
        created_at: now,
        updated_at: now
    });
}

async function insertNativeTool({ environmentId, name, fileLocation = '_LOCAL_FILE_' }: { environmentId: number; name: string; fileLocation?: string }) {
    (
        await functionConfigService.upsert(db.knex, [
            {
                environmentId,
                integrationId: 'github',
                name,
                version: {
                    description: 'Native tool',
                    tags: {},
                    file_location: fileLocation,
                    version: 'test',
                    source: 'repo',
                    trigger: { kind: 'http' },
                    requires: { connection: true, outbound: false, invoke: false },
                    capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
                    limits: { concurrency: { perConnection: 'max' } },
                    input_schema_ref: null,
                    output_schema_ref: null,
                    model_schema_refs: [],
                    metadata_schema_ref: null,
                    checkpoint_schema_ref: null,
                    json_schema: {}
                }
            }
        ])
    ).unwrap();
}

describe(`GET ${route}`, () => {
    afterEach(() => vi.restoreAllMocks());
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'get-issues' }
        });

        shouldBeProtected(res);
    });

    it.each(['_LOCAL_FILE_', 'dev/account/1/environment/1/config/github/functions/native/version.js'])(
        'loads source from the recorded storage location %s and isolates it by integration and account',
        async (fileLocation) => {
            const { env, apiKey } = await seeders.seedAccountEnvAndUser();
            const integration = await seeders.createConfigSeed(env, 'github', 'github');
            await insertSyncConfig({ environment_id: env.id, nango_config_id: integration.id!, sync_name: 'native', type: 'action' });
            await insertNativeTool({ environmentId: env.id, name: 'native', fileLocation });
            const lookup = vi.spyOn(localFileService, 'checkForIntegrationSourceFile').mockReturnValue({ result: true, path: '/test-native.ts' });
            const read = vi.spyOn(fs.promises, 'readFile').mockResolvedValue('export default nativeTool;');
            const remoteRead = vi.spyOn(remoteFileService, 'getFile').mockResolvedValue('export default nativeTool;');
            const res = await api.fetch(route, {
                method: 'GET',
                token: apiKey.secret,
                query: { env: 'dev', type: 'tool' },
                params: { providerConfigKey: 'github', functionName: 'native' }
            });
            expect(res.res.status).toBe(200);
            expect(res.json).toEqual({ type: 'tool', code: 'export default nativeTool;' });
            if (fileLocation === '_LOCAL_FILE_') {
                expect(lookup).toHaveBeenCalledWith('github/functions/native.ts');
                expect(read).toHaveBeenCalledWith('/test-native.ts', 'utf8');
                expect(remoteRead).not.toHaveBeenCalled();
            } else {
                expect(remoteRead).toHaveBeenCalledWith(fileLocation.replace(/\.js$/, '.ts'));
                expect(lookup).not.toHaveBeenCalled();
                expect(read).not.toHaveBeenCalled();
            }

            const other = await seeders.seedAccountEnvAndUser();
            for (const [token, key] of [
                [apiKey.secret, 'other-integration'],
                [other.apiKey.secret, 'github']
            ] as const) {
                const response = await api.fetch(route, {
                    method: 'GET',
                    token,
                    query: { env: 'dev', type: 'tool' },
                    params: { providerConfigKey: key, functionName: 'native' }
                });
                expect(response.res.status).toBe(404);
            }
            expect(read).toHaveBeenCalledTimes(fileLocation === '_LOCAL_FILE_' ? 1 : 0);
            expect(remoteRead).toHaveBeenCalledTimes(fileLocation === '_LOCAL_FILE_' ? 0 : 1);
        }
    );

    it('falls back to a legacy action when no native tool matches type tool', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');
        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'legacy', type: 'action' });
        const lookup = vi.spyOn(localFileService, 'checkForIntegrationSourceFile').mockReturnValue({ result: true, path: '/test-legacy.ts' });
        vi.spyOn(fs.promises, 'readFile').mockResolvedValue('export default legacyAction;');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev', type: 'tool' },
            params: { providerConfigKey: 'github', functionName: 'legacy' }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toEqual({ type: 'action', code: 'export default legacyAction;' });
        expect(lookup).toHaveBeenCalledWith('github/actions/legacy.ts');
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: apiKey.secret, params: { providerConfigKey: 'github', functionName: 'get-issues' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('returns 404 when integration is not found', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev' },
            params: { providerConfigKey: 'missing', functionName: 'get-issues' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
    });

    it('returns 404 when function name does not exist for the integration', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'missing-function' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
    });

    it('returns the action when a sync and an action share a name and no type is given', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');

        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'sync' });
        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'action' });
        const lookup = vi.spyOn(localFileService, 'checkForIntegrationSourceFile').mockReturnValue({ result: true, path: '/shared-name.ts' });
        vi.spyOn(fs.promises, 'readFile').mockResolvedValue('export default sharedName;');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'shared-name' }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toEqual({ type: 'action', code: 'export default sharedName;' });
        expect(lookup).toHaveBeenCalledWith('github/actions/shared-name.ts');
    });

    it('returns the native tool code without type when the tool hides a legacy action', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        await insertSyncConfig({ environment_id: env.id, nango_config_id: integration.id!, sync_name: 'native', type: 'action' });
        await insertNativeTool({ environmentId: env.id, name: 'native' });
        const lookup = vi.spyOn(localFileService, 'checkForIntegrationSourceFile').mockReturnValue({ result: true, path: '/test-native.ts' });
        vi.spyOn(fs.promises, 'readFile').mockResolvedValue('export default nativeTool;');

        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev' },
            params: { providerConfigKey: 'github', functionName: 'native' }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toEqual({ type: 'tool', code: 'export default nativeTool;' });
        expect(lookup).toHaveBeenCalledWith('github/functions/native.ts');
    });

    it('disambiguates with type and returns the matching function', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');

        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'sync' });
        await insertSyncConfig({ environment_id: env.id, nango_config_id: config.id!, sync_name: 'shared-name', type: 'action' });

        // With type the resolver picks the right config; the source file lookup
        // will 404 in tests (no fixture on disk), but it must NOT be 409.
        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev', type: 'sync' },
            params: { providerConfigKey: 'github', functionName: 'shared-name' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
        expect(res.json.error.message).toContain('Source file');
    });

    it('finds an on-event script deployed to the environment', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'github', 'github');
        await insertOnEventScript({ config_id: config.id!, name: 'test-script' });

        // The source file lookup will 404 (no fixture on disk), but it must reach the file lookup —
        // i.e. NOT 404 with a 'Function ... not found' message.
        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { env: 'dev', type: 'on-event' },
            params: { providerConfigKey: 'github', functionName: 'test-script' }
        });

        expect(res.res.status).toBe(404);
        isError(res.json);
        expect(res.json.error.code).toBe('not_found');
        expect(res.json.error.message).toContain('Source file');
    });
});
