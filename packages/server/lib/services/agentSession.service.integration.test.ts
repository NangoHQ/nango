import { randomUUID } from 'node:crypto';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { seeders } from '@nangohq/shared';

import {
    createAgentSession,
    createAgentSessionToken,
    getAgentSession,
    getAgentSessionByToken,
    listExpiredAgentSessions,
    terminateAgentSession
} from './agentSession.service.js';

import type { AgentSession, AgentSessionCompiledToolset, AgentSessionResolvedConnections, DBEnvironment, DBTeam } from '@nangohq/types';

const table = 'agent_sessions';

describe('agentSession service', () => {
    let account: DBTeam;
    let environment: DBEnvironment;

    beforeAll(async () => {
        await multipleMigrations();
        await keystore.migrate(db.knex);
    });

    beforeEach(async () => {
        await db.knex(table).delete();
        const seed = await seeders.seedAccountEnvAndUser();
        account = seed.account;
        environment = seed.env;
    });

    it('creates and retrieves an immutable session snapshot', async () => {
        const expiresAt = new Date(Date.now() + 60_000);
        const resolvedConnections = {
            github: { integrationId: 'github', provider: 'github', connectionId: 'github-connection', internalConnectionId: 1, configId: 10 }
        } satisfies AgentSessionResolvedConnections;
        const compiledToolset = {
            github: { pinned: ['create_issue'], searchable: ['get_issue'] },
            slack: { pinned: [], searchable: ['send_message'] }
        } satisfies AgentSessionCompiledToolset;

        const created = (
            await createAgentSession(db.knex, {
                accountId: account.id,
                environmentId: environment.id,
                resolvedConnections,
                compiledToolset,
                metaTools: { nangoProxy: false, nangoSearch: true, nangoExecute: true },
                expiresAt
            })
        ).unwrap();

        expect(created).toMatchObject({
            accountId: account.id,
            environmentId: environment.id,
            resolvedConnections,
            compiledToolset,
            metaTools: { nangoProxy: false, nangoSearch: true, nangoExecute: true },
            expiresAt,
            endedAt: null,
            endedReason: null
        });
        expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
        expect(created.createdAt).toBeInstanceOf(Date);
        expect(created.updatedAt).toBeInstanceOf(Date);

        const retrieved = (
            await getAgentSession(db.knex, {
                id: created.id,
                accountId: account.id,
                environmentId: environment.id
            })
        ).unwrap();
        expect(retrieved).toStrictEqual(created);
    });

    it('scopes session retrieval to the account and environment', async () => {
        const session = await createSession({ account, environment });
        const other = await seeders.seedAccountEnvAndUser();

        const wrongTenant = await getAgentSession(db.knex, {
            id: session.id,
            accountId: other.account.id,
            environmentId: other.env.id
        });
        const unknown = await getAgentSession(db.knex, {
            id: randomUUID(),
            accountId: account.id,
            environmentId: environment.id
        });

        expect(wrongTenant.isErr()).toBe(true);
        expect(unknown.isErr()).toBe(true);
        if (wrongTenant.isErr()) {
            expect(wrongTenant.error.code).toBe('not_found');
        }
        if (unknown.isErr()) {
            expect(unknown.error.code).toBe('not_found');
        }
    });

    it('rejects an environment owned by another account', async () => {
        const other = await seeders.seedAccountEnvAndUser();

        const result = await createAgentSession(db.knex, {
            accountId: account.id,
            environmentId: other.env.id,
            resolvedConnections: {},
            compiledToolset: {},
            metaTools: { nangoProxy: false, nangoSearch: true, nangoExecute: true },
            expiresAt: new Date(Date.now() + 60_000)
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('creation_failed');
        }
    });

    it('rejects a soft-deleted environment', async () => {
        await db.knex('_nango_environments').where({ id: environment.id }).update({ deleted: true, deleted_at: new Date() });

        const result = await createAgentSession(db.knex, {
            accountId: account.id,
            environmentId: environment.id,
            resolvedConnections: {},
            compiledToolset: {},
            metaTools: { nangoProxy: false, nangoSearch: true, nangoExecute: true },
            expiresAt: new Date(Date.now() + 60_000)
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('creation_failed');
        }
    });

    it('terminates a session idempotently without replacing its terminal state', async () => {
        const session = await createSession({ account, environment });

        const terminated = (
            await terminateAgentSession(db.knex, {
                id: session.id,
                accountId: account.id,
                environmentId: environment.id,
                reason: 'terminated'
            })
        ).unwrap();
        expect(terminated.endedAt).toBeInstanceOf(Date);
        expect(terminated.endedReason).toBe('terminated');

        const retried = (
            await terminateAgentSession(db.knex, {
                id: session.id,
                accountId: account.id,
                environmentId: environment.id,
                reason: 'expired'
            })
        ).unwrap();
        expect(retried.endedAt).toStrictEqual(terminated.endedAt);
        expect(retried.endedReason).toBe('terminated');
    });

    it('mints a token that resolves back to the session', async () => {
        const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
        const session = await createSession({ account, environment, expiresAt });

        const minted = (await createAgentSessionToken(db.knex, session)).unwrap();
        expect(minted.token).toMatch(/^nango_agent_session_[a-f0-9]{64}$/);
        expect(Math.abs(minted.expiresAt.getTime() - expiresAt.getTime())).toBeLessThan(5_000);

        const resolved = (await getAgentSessionByToken(db.knex, minted.token)).unwrap();
        expect(resolved).toStrictEqual(session);
    });

    it('rejects an unknown token', async () => {
        const result = await getAgentSessionByToken(db.knex, `nango_agent_session_${'a'.repeat(64)}`);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('not_found');
        }
    });

    it('rejects a token minted for another entity type', async () => {
        const [token] = (
            await keystore.createPrivateKey(db.knex, {
                displayName: '',
                entityType: 'connect_session',
                entityId: 1,
                accountId: account.id,
                environmentId: environment.id
            })
        ).unwrap();

        const result = await getAgentSessionByToken(db.knex, token);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('not_found');
        }
    });

    it('refuses to mint a token for an expired session', async () => {
        const session = await createSession({ account, environment, expiresAt: new Date(Date.now() - 60_000) });

        const result = await createAgentSessionToken(db.knex, session);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('token_creation_failed');
        }
    });

    it('stops resolving the token once it expires', async () => {
        const session = await createSession({ account, environment, expiresAt: new Date(Date.now() + 300) });
        const minted = (await createAgentSessionToken(db.knex, session)).unwrap();

        await new Promise((resolve) => setTimeout(resolve, 400));

        const result = await getAgentSessionByToken(db.knex, minted.token);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('not_found');
        }
    });

    it('lists active expired sessions in expiration order and honors the limit', async () => {
        const expiredOld = await createSession({ account, environment, expiresAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
        const expiredEnded = await createSession({ account, environment, expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
        const expiredRecent = await createSession({ account, environment, expiresAt: new Date(Date.now() - 60 * 60 * 1000) });
        const active = await createSession({ account, environment, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
        (
            await terminateAgentSession(db.knex, {
                id: expiredEnded.id,
                accountId: account.id,
                environmentId: environment.id,
                reason: 'expired'
            })
        ).unwrap();

        const limited = await listExpiredAgentSessions(db.knex, { limit: 1 });
        expect(limited.map(({ id }) => id)).toStrictEqual([expiredOld.id]);

        const expired = await listExpiredAgentSessions(db.knex, { limit: 10 });
        expect(expired.map(({ id }) => id)).toStrictEqual([expiredOld.id, expiredRecent.id]);
        expect(expired.map(({ id }) => id)).not.toContain(expiredEnded.id);
        expect(expired.map(({ id }) => id)).not.toContain(active.id);
    });
});

async function createSession({
    account,
    environment,
    expiresAt = new Date(Date.now() + 60_000)
}: {
    account: DBTeam;
    environment: DBEnvironment;
    expiresAt?: Date;
}): Promise<AgentSession> {
    return (
        await createAgentSession(db.knex, {
            accountId: account.id,
            environmentId: environment.id,
            resolvedConnections: {},
            compiledToolset: {},
            metaTools: { nangoProxy: false, nangoSearch: true, nangoExecute: true },
            expiresAt
        })
    ).unwrap();
}
