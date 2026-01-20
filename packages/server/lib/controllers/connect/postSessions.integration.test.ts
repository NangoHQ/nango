import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { DBConnectSession } from '../../services/connectSession.service.js';
import type { DBEndUser, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connect/sessions';

describe(`POST ${endpoint}`, () => {
    let seed: { account: DBTeam; env: DBEnvironment; user: DBUser; plan: DBPlan };

    beforeAll(async () => {
        api = await runServer();
        seed = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(seed.env, 'github', 'github');
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error on purpose
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should fail if no endUser', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            // @ts-expect-error on purpose
            body: {}
        });

        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected object, received undefined', path: ['end_user'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should fail if no endUserId', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                // @ts-expect-error on purpose
                end_user: {}
            }
        });

        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['end_user', 'id'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should return new connectSessionToken', async () => {
        const endUserId = randomUUID();
        const email = 'a@b.com';
        const displayName = 'Mr AB';
        const orgId = 'orgId';
        const orgDisplayName = 'OrgName';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                end_user: { id: endUserId, email, display_name: displayName },
                organization: { id: orgId, display_name: orgDisplayName }
            }
        });
        isSuccess(res.json);

        // Should not have created an end user
        const profile = await db.knex.select<DBEndUser>('*').from('end_users').where('end_user_id', endUserId).first();
        expect(profile).toBeUndefined();
    });

    it('should fail if integration in allowed_integrations does not exist', async () => {
        const endUserId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, allowed_integrations: ['random'] }
        });
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'custom', message: 'Integration does not exist', path: ['allowed_integrations', '0'] }]
            }
        });
    });

    it('should fail if integration in integrations_config_defaults does not exist', async () => {
        const endUserId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, integrations_config_defaults: { random: { connection_config: {} } } }
        });
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'custom', message: 'Integration does not exist', path: ['integrations_config_defaults', 'random'] }]
            }
        });
    });

    it('should fail if integration in overrides does not exist', async () => {
        const endUserId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, overrides: { random: { docs_connect: 'https://nango.dev/docs' } } }
        });
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'custom', message: 'Integration does not exist', path: ['overrides', 'random'] }]
            }
        });
    });

    it('should succeed if allowed_integrations is passed and exist', async () => {
        const endUserId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, allowed_integrations: ['github'] }
        });
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                expires_at: expect.toBeIsoDate(),
                connect_link: expect.any(String),
                token: expect.any(String)
            }
        });
    });

    it('should succeed if integrations_config_defaults is passed and exist', async () => {
        const endUserId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, integrations_config_defaults: { github: { connection_config: {} } } }
        });
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                expires_at: expect.toBeIsoDate(),
                connect_link: expect.any(String),
                token: expect.any(String)
            }
        });
    });

    describe('docs connect url override validation', () => {
        it('should allow docs connect url override when plan has can_override_docs_connect_url enabled', async () => {
            // Update the plan to enable the feature flag
            await db.knex('plans').where('id', seed.plan.id).update({ can_override_docs_connect_url: true });

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    overrides: {
                        github: {
                            docs_connect: 'https://custom-docs.example.com'
                        }
                    }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual<typeof res.json>({
                data: {
                    expires_at: expect.toBeIsoDate(),
                    connect_link: expect.any(String),
                    token: expect.any(String)
                }
            });
        });

        it('should reject docs connect url override when plan has can_override_docs_connect_url disabled', async () => {
            // Ensure the plan has the feature flag disabled
            await db.knex('plans').where('id', seed.plan.id).update({ can_override_docs_connect_url: false });

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    overrides: {
                        github: {
                            docs_connect: 'https://custom-docs.example.com'
                        }
                    }
                }
            });

            isError(res.json);
            expect(res.json).toStrictEqual<typeof res.json>({
                error: {
                    code: 'forbidden',
                    message: 'You are not allowed to override the docs connect url'
                }
            });
            expect(res.res.status).toBe(403);
        });

        it('should allow request when overrides exist but no docs_connect override is present', async () => {
            // Ensure the plan has the feature flag disabled
            await db.knex('plans').where('id', seed.plan.id).update({ can_override_docs_connect_url: false });

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    overrides: {
                        github: {
                            // No docs_connect override
                        }
                    }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual<typeof res.json>({
                data: {
                    expires_at: expect.toBeIsoDate(),
                    connect_link: expect.any(String),
                    token: expect.any(String)
                }
            });
        });

        it('should allow request when overrides exist but docs_connect is undefined', async () => {
            // Ensure the plan has the feature flag disabled
            await db.knex('plans').where('id', seed.plan.id).update({ can_override_docs_connect_url: false });

            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    overrides: {
                        github: {
                            docs_connect: undefined
                        }
                    }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual<typeof res.json>({
                data: {
                    expires_at: expect.toBeIsoDate(),
                    connect_link: expect.any(String),
                    token: expect.any(String)
                }
            });
        });
    });

    describe('tags', () => {
        it('should create session with valid tags', async () => {
            const tags = { projectId: '123', orgId: '456' };
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    tags
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual<typeof res.json>({
                data: {
                    expires_at: expect.toBeIsoDate(),
                    connect_link: expect.any(String),
                    token: expect.any(String)
                }
            });

            const session = await db.knex
                .select('*')
                .from<DBConnectSession>('connect_sessions')
                .where({ environment_id: seed.env.id })
                .orderBy('id', 'desc')
                .first();
            expect(session?.tags).toStrictEqual(tags);
        });

        it('should create session without tags (optional)', async () => {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user-no-tags', email: 'test@example.com' }
                }
            });

            isSuccess(res.json);
        });

        it('should create session with empty tags object', async () => {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user-empty-tags', email: 'test@example.com' },
                    tags: {}
                }
            });

            isSuccess(res.json);

            const session = await db.knex
                .select('*')
                .from<DBConnectSession>('connect_sessions')
                .where({ environment_id: seed.env.id })
                .orderBy('id', 'desc')
                .first();
            expect(session?.tags).toStrictEqual({});
        });

        it('should fail with invalid tag key format (starts with number)', async () => {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    tags: { '123invalid': 'value' }
                }
            });

            isError(res.json);
            expect(res.json).toMatchObject({
                error: { code: 'invalid_body' }
            });
            expect(res.res.status).toBe(400);
        });

        it('should fail with invalid tag value format (contains spaces)', async () => {
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    tags: { key: 'value with spaces' }
                }
            });

            isError(res.json);
            expect(res.json).toMatchObject({
                error: { code: 'invalid_body' }
            });
            expect(res.res.status).toBe(400);
        });

        it('should fail with tag key exceeding max length', async () => {
            const longKey = 'a'.repeat(65);
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    tags: { [longKey]: 'value' }
                }
            });

            isError(res.json);
            expect(res.json).toMatchObject({
                error: { code: 'invalid_body' }
            });
            expect(res.res.status).toBe(400);
        });

        it('should fail with tag value exceeding max length', async () => {
            const longValue = 'a'.repeat(201);
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    tags: { key: longValue }
                }
            });

            isError(res.json);
            expect(res.json).toMatchObject({
                error: { code: 'invalid_body' }
            });
            expect(res.res.status).toBe(400);
        });

        it('should fail with more than 64 tags', async () => {
            const tags: Record<string, string> = {};
            for (let i = 0; i < 65; i++) {
                tags[`key${i}`] = `value${i}`;
            }
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: seed.env.secret_key,
                body: {
                    end_user: { id: 'test-user', email: 'test@example.com' },
                    tags
                }
            });

            isError(res.json);
            expect(res.json).toMatchObject({
                error: { code: 'invalid_body' }
            });
            expect(res.res.status).toBe(400);
        });
    });
});
