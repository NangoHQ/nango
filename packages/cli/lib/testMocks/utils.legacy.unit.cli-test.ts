import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LegacyFixtureProvider, RecordingFixtureProvider } from './utils.js';

describe('RecordingFixtureProvider migration fallback', () => {
    it('backfills hash and request data from runtime identity when legacy mocks are response-only', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-migrate-mocks-'));
        const outputPath = path.join(tempDir, 'change-user-role.test.json');

        const response = {
            id: '010101',
            email: 'foo@foo.com',
            roleIds: [],
            superAdmin: false
        };

        const delegate = {
            getCachedResponse: () => Promise.resolve({ response }),
            getAllMocksForEndpoint: () =>
                Promise.resolve([
                    {
                        method: 'put',
                        endpoint: 'settings/v3/users/010101',
                        requestIdentityHash: '',
                        requestIdentity: {
                            method: 'put',
                            endpoint: 'settings/v3/users/010101',
                            params: [],
                            headers: [],
                            data: undefined
                        },
                        response
                    }
                ])
        } as unknown as ConstructorParameters<typeof RecordingFixtureProvider>[0];

        const provider = new RecordingFixtureProvider(delegate, outputPath);

        await provider.getCachedResponse({
            method: 'put',
            endpoint: 'settings/v3/users/010101',
            requestIdentityHash: 'e0b1f69488fe8f65de01cf51fdb2e7a132c08b7c',
            requestIdentity: {
                method: 'put',
                endpoint: 'settings/v3/users/010101',
                params: [],
                headers: [],
                data: '{"superAdmin":false}'
            }
        });

        const saved = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
        const migratedEntry = saved.api.put['settings/v3/users/010101'][0];

        expect(migratedEntry.hash).toBe('e0b1f69488fe8f65de01cf51fdb2e7a132c08b7c');
        expect(migratedEntry.request).toEqual({
            data: {
                superAdmin: false
            }
        });
    });

    it('prefers legacy request identity when the legacy mock already has one', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-migrate-mocks-'));
        const outputPath = path.join(tempDir, 'update-user.test.json');

        const response = {
            id: '010101',
            superAdmin: true
        };

        const delegate = {
            getCachedResponse: () => Promise.resolve({ response }),
            getAllMocksForEndpoint: () =>
                Promise.resolve([
                    {
                        method: 'put',
                        endpoint: 'settings/v3/users/010101',
                        requestIdentityHash: 'legacy-hash',
                        requestIdentity: {
                            method: 'put',
                            endpoint: 'settings/v3/users/010101',
                            params: [['force', 'true']],
                            headers: [['x-test', 'legacy']],
                            data: { superAdmin: true }
                        },
                        response
                    }
                ])
        } as unknown as ConstructorParameters<typeof RecordingFixtureProvider>[0];

        const provider = new RecordingFixtureProvider(delegate, outputPath);

        await provider.getCachedResponse({
            method: 'put',
            endpoint: 'settings/v3/users/010101',
            requestIdentityHash: 'runtime-hash',
            requestIdentity: {
                method: 'put',
                endpoint: 'settings/v3/users/010101',
                params: [],
                headers: [],
                data: '{"superAdmin":false}'
            }
        });

        const saved = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
        const migratedEntry = saved.api.put['settings/v3/users/010101'][0];

        expect(migratedEntry.hash).toBe('legacy-hash');
        expect(migratedEntry.request).toEqual({
            params: {
                force: 'true'
            },
            headers: {
                'x-test': 'legacy'
            },
            data: {
                superAdmin: true
            }
        });
    });

    it('keeps non-JSON runtime request data as-is when backfilling', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-migrate-mocks-'));
        const outputPath = path.join(tempDir, 'submit-form.test.json');

        const delegate = {
            getCachedResponse: () => Promise.resolve({ response: { ok: true } }),
            getAllMocksForEndpoint: () =>
                Promise.resolve([
                    {
                        method: 'post',
                        endpoint: 'forms/v1/submit',
                        requestIdentityHash: '',
                        requestIdentity: {
                            method: 'post',
                            endpoint: 'forms/v1/submit',
                            params: [],
                            headers: [],
                            data: undefined
                        },
                        response: { ok: true }
                    }
                ])
        } as unknown as ConstructorParameters<typeof RecordingFixtureProvider>[0];

        const provider = new RecordingFixtureProvider(delegate, outputPath);

        await provider.getCachedResponse({
            method: 'post',
            endpoint: 'forms/v1/submit',
            requestIdentityHash: 'runtime-form-hash',
            requestIdentity: {
                method: 'post',
                endpoint: 'forms/v1/submit',
                params: [],
                headers: [],
                data: 'field=name&value=alice'
            }
        });

        const saved = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
        const migratedEntry = saved.api.post['forms/v1/submit'][0];

        expect(migratedEntry.hash).toBe('runtime-form-hash');
        expect(migratedEntry.request).toEqual({
            data: 'field=name&value=alice'
        });
    });

    it('deduplicates migrated records by hash for the same endpoint', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-migrate-mocks-'));
        const outputPath = path.join(tempDir, 'duplicate-hash.test.json');

        const response = { ok: true };

        const delegate = {
            getCachedResponse: () => Promise.resolve({ response }),
            getAllMocksForEndpoint: () =>
                Promise.resolve([
                    {
                        method: 'get',
                        endpoint: 'crm/v3/objects/users',
                        requestIdentityHash: 'same-hash',
                        requestIdentity: {
                            method: 'get',
                            endpoint: 'crm/v3/objects/users',
                            params: [],
                            headers: [],
                            data: undefined
                        },
                        response
                    },
                    {
                        method: 'get',
                        endpoint: 'crm/v3/objects/users',
                        requestIdentityHash: 'same-hash',
                        requestIdentity: {
                            method: 'get',
                            endpoint: 'crm/v3/objects/users',
                            params: [],
                            headers: [],
                            data: undefined
                        },
                        response
                    }
                ])
        } as unknown as ConstructorParameters<typeof RecordingFixtureProvider>[0];

        const provider = new RecordingFixtureProvider(delegate, outputPath);

        await provider.getCachedResponse({
            method: 'get',
            endpoint: 'crm/v3/objects/users',
            requestIdentityHash: 'same-hash',
            requestIdentity: {
                method: 'get',
                endpoint: 'crm/v3/objects/users',
                params: [],
                headers: [],
                data: undefined
            }
        });

        const saved = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
        const migratedEntries = saved.api.get['crm/v3/objects/users'];

        expect(migratedEntries).toHaveLength(1);
        expect(migratedEntries[0]?.hash).toBe('same-hash');
    });
});

describe('LegacyFixtureProvider migration compatibility', () => {
    it('includes name-based mocks with falsy responses', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-legacy-mocks-'));
        const testsDir = path.join(tempDir, 'tests');
        const baseDir = path.join(tempDir, 'mocks', 'nango', 'delete', 'proxy', 'settings', 'v3', 'users');
        await fs.mkdir(testsDir, { recursive: true });

        const cases = [
            { id: 'empty-string', fileContent: '', expected: '' },
            { id: 'zero', fileContent: 0, expected: 0 },
            { id: 'false', fileContent: false, expected: false },
            { id: 'null', fileContent: null, expected: null }
        ];

        for (const testCase of cases) {
            const mockDir = path.join(baseDir, testCase.id);
            await fs.mkdir(mockDir, { recursive: true });
            await fs.writeFile(path.join(mockDir, 'delete-user.json'), JSON.stringify(testCase.fileContent));

            const provider = new LegacyFixtureProvider(testsDir, 'delete-user');
            const allMocks = await provider.getAllMocksForEndpoint('delete', `settings/v3/users/${testCase.id}`);

            expect(allMocks).toHaveLength(1);
            expect(allMocks[0]?.response).toBe(testCase.expected);
        }
    });

    it('returns exact hash match from hash-based directories', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-legacy-hash-match-'));
        const testsDir = path.join(tempDir, 'tests');
        const endpoint = 'crm/v3/objects/contacts';
        const hash = 'abc123';
        const hashDir = path.join(tempDir, 'mocks', 'nango', 'get', 'proxy', endpoint, 'contacts');
        await fs.mkdir(testsDir, { recursive: true });
        await fs.mkdir(hashDir, { recursive: true });

        await fs.writeFile(
            path.join(hashDir, `${hash}.json`),
            JSON.stringify({
                method: 'get',
                endpoint,
                requestIdentityHash: hash,
                requestIdentity: {
                    method: 'get',
                    endpoint,
                    params: [['limit', '10']],
                    headers: []
                },
                response: { results: [{ id: '1' }] }
            })
        );

        const provider = new LegacyFixtureProvider(testsDir, 'contacts');
        const response = await provider.getCachedResponse({
            method: 'get',
            endpoint,
            requestIdentityHash: hash,
            requestIdentity: {
                method: 'get',
                endpoint,
                params: [['limit', '10']],
                headers: []
            }
        });

        expect(response.response).toEqual({ results: [{ id: '1' }] });
    });

    it('falls back to params matching when hash misses in hash-based directories', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-legacy-params-fallback-'));
        const testsDir = path.join(tempDir, 'tests');
        const endpoint = 'crm/v3/objects/contacts';
        const hashDir = path.join(tempDir, 'mocks', 'nango', 'get', 'proxy', endpoint, 'contacts');
        await fs.mkdir(testsDir, { recursive: true });
        await fs.mkdir(hashDir, { recursive: true });

        await fs.writeFile(
            path.join(hashDir, 'stored-hash.json'),
            JSON.stringify({
                method: 'get',
                endpoint,
                requestIdentityHash: 'stored-hash',
                requestIdentity: {
                    method: 'get',
                    endpoint,
                    params: [
                        ['after', 'cursor-1'],
                        ['limit', '10']
                    ],
                    headers: [['x-tenant', 'tenant-a']]
                },
                response: { results: [{ id: '2' }] }
            })
        );

        const provider = new LegacyFixtureProvider(testsDir, 'contacts');
        const response = await provider.getCachedResponse({
            method: 'get',
            endpoint,
            requestIdentityHash: 'missing-hash',
            requestIdentity: {
                method: 'get',
                endpoint,
                params: [
                    ['limit', '10'],
                    ['after', 'cursor-1']
                ],
                headers: [['x-tenant', 'tenant-a']]
            }
        });

        expect(response.response).toEqual({ results: [{ id: '2' }] });
    });
});
