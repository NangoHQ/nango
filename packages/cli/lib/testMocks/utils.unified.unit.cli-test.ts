import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NangoActionMock } from './utils.js';

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
