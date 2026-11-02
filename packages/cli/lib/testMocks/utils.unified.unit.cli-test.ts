import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { createFunction } from '@nangohq/runner-sdk';

import { ResponseCollector } from '../services/response-collector.service.js';
import { fixturesPath } from '../tests/helpers.js';
import { NangoActionMock, NangoSyncMock, replayFunction } from './utils.js';

async function withMigrateMocksEnv<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
    const previous = process.env['MIGRATE_MOCKS'];
    if (value === undefined) {
        delete process.env['MIGRATE_MOCKS'];
    } else {
        process.env['MIGRATE_MOCKS'] = value;
    }

    try {
        return await fn();
    } finally {
        if (previous !== undefined) {
            process.env['MIGRATE_MOCKS'] = previous;
        } else {
            delete process.env['MIGRATE_MOCKS'];
        }
    }
}

async function createTestDir(prefix: string): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    const testsDir = path.join(tempDir, 'tests');
    await fs.mkdir(testsDir, { recursive: true });
    return testsDir;
}

describe('UnifiedFixtureProvider precedence', () => {
    const setupConflictingFixtures = async () => {
        const testsDir = await createTestDir('nango-unified-precedence-');
        const legacyDir = path.join(path.dirname(testsDir), 'mocks', 'nango', 'get', 'proxy', 'foo');
        await fs.mkdir(legacyDir, { recursive: true });

        await fs.writeFile(
            path.join(testsDir, 'conflict.test.json'),
            JSON.stringify(
                {
                    output: { source: 'unified-output' },
                    api: {
                        get: {
                            foo: {
                                request: {},
                                response: { source: 'unified' },
                                hash: ''
                            }
                        }
                    }
                },
                null,
                2
            )
        );

        await fs.writeFile(path.join(legacyDir, 'conflict.json'), JSON.stringify({ source: 'legacy' }));

        return testsDir;
    };

    it('uses unified mocks over legacy when both exist', async () => {
        await withMigrateMocksEnv(undefined, async () => {
            const testsDir = await setupConflictingFixtures();
            const nangoMock = new NangoActionMock({
                dirname: testsDir,
                name: 'conflict',
                Model: 'ConflictModel'
            });

            const response = await nangoMock.get({ endpoint: '/foo' });
            const output = await nangoMock.getOutput();

            expect(response.data).toEqual({ source: 'unified' });
            expect(output).toEqual({ source: 'unified-output' });
        });
    });

    it('still uses unified mocks when MIGRATE_MOCKS is set and both exist', async () => {
        await withMigrateMocksEnv('V1', async () => {
            const testsDir = await setupConflictingFixtures();
            const nangoMock = new NangoActionMock({
                dirname: testsDir,
                name: 'conflict',
                Model: 'ConflictModel'
            });

            const response = await nangoMock.get({ endpoint: '/foo' });
            expect(response.data).toEqual({ source: 'unified' });
        });
    });
});

describe('UnifiedFixtureProvider matching behavior', () => {
    it('matches endpoint keys with or without leading slash', async () => {
        const testsDir = await createTestDir('nango-unified-endpoint-');
        await fs.writeFile(
            path.join(testsDir, 'endpoint.test.json'),
            JSON.stringify(
                {
                    api: {
                        get: {
                            '/foo': {
                                request: {},
                                response: { ok: true },
                                hash: ''
                            }
                        }
                    }
                },
                null,
                2
            )
        );

        const nangoMock = new NangoActionMock({
            dirname: testsDir,
            name: 'endpoint',
            Model: 'EndpointModel'
        });

        const response = await nangoMock.get({ endpoint: '/foo' });
        expect(response.data).toEqual({ ok: true });
    });

    it('matches query params embedded in the endpoint string', async () => {
        const testsDir = await createTestDir('nango-unified-query-in-endpoint-');
        await fs.writeFile(
            path.join(testsDir, 'query-in-endpoint.test.json'),
            JSON.stringify(
                {
                    api: {
                        get: {
                            '/foo': {
                                request: {
                                    params: {
                                        a: '1',
                                        b: '2'
                                    }
                                },
                                response: { ok: true },
                                hash: ''
                            }
                        }
                    }
                },
                null,
                2
            )
        );

        const nangoMock = new NangoActionMock({
            dirname: testsDir,
            name: 'query-in-endpoint',
            Model: 'QueryInEndpointModel'
        });

        const response = await nangoMock.get({ endpoint: '/foo?a=1&b=2' });
        expect(response.data).toEqual({ ok: true });
    });

    it('matches both single-object and array API entries', async () => {
        const testsDir = await createTestDir('nango-unified-shapes-');
        await fs.writeFile(
            path.join(testsDir, 'shapes.test.json'),
            JSON.stringify(
                {
                    api: {
                        get: {
                            one: {
                                request: {},
                                response: { shape: 'object' },
                                hash: ''
                            },
                            many: [
                                {
                                    request: {
                                        params: { page: '1' }
                                    },
                                    response: { page: 1 },
                                    hash: ''
                                },
                                {
                                    request: {
                                        params: { page: '2' }
                                    },
                                    response: { page: 2 },
                                    hash: ''
                                }
                            ]
                        }
                    }
                },
                null,
                2
            )
        );

        const nangoMock = new NangoActionMock({
            dirname: testsDir,
            name: 'shapes',
            Model: 'ShapesModel'
        });

        const single = await nangoMock.get({ endpoint: '/one' });
        const page2 = await nangoMock.get({ endpoint: '/many', params: { page: '2' } });

        expect(single.data).toEqual({ shape: 'object' });
        expect(page2.data).toEqual({ page: 2 });
    });

    it('matches headers case-insensitively and params regardless of order', async () => {
        const testsDir = await createTestDir('nango-unified-request-match-');
        await fs.writeFile(
            path.join(testsDir, 'request-matching.test.json'),
            JSON.stringify(
                {
                    api: {
                        get: {
                            foo: [
                                {
                                    request: {
                                        params: {
                                            a: '1',
                                            b: '2'
                                        },
                                        headers: {
                                            'X-Custom': 'match'
                                        }
                                    },
                                    response: { ok: true },
                                    hash: ''
                                }
                            ]
                        }
                    }
                },
                null,
                2
            )
        );

        const nangoMock = new NangoActionMock({
            dirname: testsDir,
            name: 'request-matching',
            Model: 'RequestMatchingModel'
        });

        const response = await nangoMock.get({
            endpoint: '/foo',
            params: { b: '2', a: '1' },
            headers: { 'x-custom': 'match' }
        });

        expect(response.data).toEqual({ ok: true });
    });

    it('ignores axios default application/x-www-form-urlencoded content-type when matching', async () => {
        const testsDir = await createTestDir('nango-unified-ignore-form-content-type-');
        await fs.writeFile(
            path.join(testsDir, 'ignore-form-content-type.test.json'),
            JSON.stringify(
                {
                    api: {
                        post: {
                            foo: [
                                {
                                    request: {
                                        headers: {
                                            'Content-Type': 'application/x-www-form-urlencoded'
                                        }
                                    },
                                    response: { ok: true },
                                    hash: ''
                                }
                            ]
                        }
                    }
                },
                null,
                2
            )
        );

        const nangoMock = new NangoActionMock({
            dirname: testsDir,
            name: 'ignore-form-content-type',
            Model: 'IgnoreFormContentTypeModel'
        });

        // Deliberately omit headers; axios would inject this header at runtime.
        const response = await nangoMock.post({ endpoint: '/foo' });
        expect(response.data).toEqual({ ok: true });
    });

    it('only applies single-mock fallback when request has no params', async () => {
        const testsDir = await createTestDir('nango-unified-fallback-');
        await fs.writeFile(
            path.join(testsDir, 'fallback.test.json'),
            JSON.stringify(
                {
                    api: {
                        get: {
                            foo: {
                                response: { ok: true }
                            }
                        }
                    }
                },
                null,
                2
            )
        );

        const nangoMock = new NangoActionMock({
            dirname: testsDir,
            name: 'fallback',
            Model: 'FallbackModel'
        });

        const noParams = await nangoMock.get({ endpoint: '/foo' });
        expect(noParams.data).toEqual({ ok: true });

        await expect(nangoMock.get({ endpoint: '/foo', params: { q: '1' } })).rejects.toThrow('No mock found for GET foo');
    });
});

describe('native fixture replay', () => {
    const dirname = path.join(fixturesPath, 'replay/github/tests');

    it.each([
        { name: 'echo', source: '../functions/echo.ts' },
        { name: 'fetch_repository_issue_details', source: '../tools/getIssue.ts' }
    ])('replays the recorded $name function', async ({ name, source }) => {
        const { default: definition } = await import(path.resolve(dirname, source));
        await replayFunction({ dirname, name, definition });
    });

    it('rejects output that differs from the recorded response', async () => {
        const { default: issueTool } = await import(path.resolve(dirname, '../tools/getIssue.ts'));
        await expect(
            replayFunction({
                dirname,
                name: 'fetch_repository_issue_details',
                definition: issueTool,
                mocks: { get: vi.fn().mockResolvedValue({ data: { title: 'Changed issue' } }) }
            })
        ).rejects.toThrow();
    });

    it('rejects a fixture without a recorded trigger', async () => {
        const testsDir = await createTestDir('nango-native-trigger-');
        try {
            new ResponseCollector().saveUnifiedMock({
                filePath: path.join(testsDir, 'schedule.test.json'),
                input: undefined,
                output: { kind: 'schedule', input: null }
            });
            const { default: definition } = await import(path.join(fixturesPath, 'zero/cases/createFunction.schedule.valid.ts'));
            await expect(replayFunction({ dirname: testsDir, name: 'schedule', definition })).rejects.toThrow('Missing trigger in saved fixture for schedule');
        } finally {
            await fs.rm(path.dirname(testsDir), { recursive: true, force: true });
        }
    });

    it('replays saved records, metadata, and initial checkpoints', async () => {
        const testsDir = await createTestDir('nango-native-state-');
        try {
            const collector = new ResponseCollector();
            collector.addBatchSave('Issue::replay', [{ id: '123', title: 'Recorded issue' }]);
            collector.addBatchDelete('Issue::replay', [{ id: 'old', title: 'Deleted issue' }]);
            collector.saveUnifiedMock({
                filePath: path.join(testsDir, 'state.test.json'),
                input: { id: '123' },
                output: { account: 'updated', page: 2, cleared: true },
                trigger: { kind: 'invoke', input: { id: '123' } },
                stubbedMetadata: { account: 'initial' },
                stubbedCheckpoint: { page: 1 },
                variant: 'replay'
            });

            const definition = createFunction({
                description: 'Replay local state and record changes',
                requires: { outbound: false },
                input: z.object({ id: z.string() }),
                data: {
                    models: { Issue: z.object({ id: z.string(), title: z.string() }) },
                    metadata: z.object({ account: z.string() }),
                    checkpoint: z.object({ page: z.number() })
                },
                output: z.object({ account: z.string(), page: z.number(), cleared: z.boolean() }),
                exec: async (nango, trigger) => {
                    await nango.batchSave([{ id: trigger.input.id, title: 'Recorded issue' }], 'Issue');
                    await nango.batchDelete([{ id: 'old', title: 'Deleted issue' }], 'Issue');
                    const checkpoint = await nango.getCheckpoint();
                    await nango.saveCheckpoint({ page: (checkpoint?.page ?? 0) + 1 });
                    const savedCheckpoint = await nango.getCheckpoint();
                    await nango.clearCheckpoint();
                    await nango.updateMetadata({ account: 'updated' });
                    return {
                        account: (await nango.getMetadata()).account,
                        page: savedCheckpoint?.page ?? 0,
                        cleared: (await nango.getCheckpoint()) === undefined
                    };
                }
            });

            await replayFunction({ dirname: testsDir, name: 'state', definition });
            collector.addBatchSave('Issue::replay', [{ id: 'unexpected', title: 'Extra record' }]);
            collector.saveUnifiedMock({
                filePath: path.join(testsDir, 'state.test.json'),
                input: { id: '123' },
                output: { account: 'updated', page: 2, cleared: true },
                trigger: { kind: 'invoke', input: { id: '123' } },
                stubbedMetadata: { account: 'initial' },
                stubbedCheckpoint: { page: 1 },
                variant: 'replay'
            });
            await expect(replayFunction({ dirname: testsDir, name: 'state', definition })).rejects.toThrow('state: records for Issue::replay');
        } finally {
            await fs.rm(path.dirname(testsDir), { recursive: true, force: true });
        }
    });
});

describe('NangoSyncMock checkpoint behavior', () => {
    it('stores and clears checkpoints in memory', async () => {
        const testsDir = await createTestDir('nango-sync-checkpoint-');
        const nangoMock = new NangoSyncMock({
            dirname: testsDir,
            name: 'checkpoint',
            Model: 'CheckpointModel'
        });

        expect(await nangoMock.getCheckpoint()).toBeNull();

        const checkpoint = {
            cursor: 'next-page',
            page: 2,
            done: false
        };

        await nangoMock.saveCheckpoint(checkpoint);
        expect(await nangoMock.getCheckpoint()).toEqual(checkpoint);

        await nangoMock.clearCheckpoint();
        expect(await nangoMock.getCheckpoint()).toBeNull();
    });
});
