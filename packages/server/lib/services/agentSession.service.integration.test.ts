import { randomUUID } from 'node:crypto';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { createAgentSession, getAgentSession, listExpiredAgentSessions, terminateAgentSession } from './agentSession.service.js';

import type { AgentSession, AgentSessionCompiledToolset, AgentSessionResolvedConnections, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const table = 'agent_sessions';

describe('agentSession service', () => {
    let account: DBTeam;
    let environment: DBEnvironment;

    beforeAll(async () => {
        await multipleMigrations();
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
            github: { connectionId: 'github-connection', tags: { endUser: 'customer-1' } },
            slack: null
        } satisfies AgentSessionResolvedConnections;
        const compiledToolset = {
            github: { pinned: ['create_issue'], searchable: ['get_issue'] },
            slack: { pinned: [], searchable: ['send_message'] }
        } satisfies AgentSessionCompiledToolset;

        const created = unwrap(
            await createAgentSession(db.knex, {
                accountId: account.id,
                environmentId: environment.id,
                resolvedConnections,
                compiledToolset,
                metaTools: { nangoProxy: false, nangoSearch: true, nangoExecute: true },
                expiresAt
            })
        );

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

        const retrieved = unwrap(
            await getAgentSession(db.knex, {
                id: created.id,
                accountId: account.id,
                environmentId: environment.id
            })
        );
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

    it('terminates a session idempotently without replacing its terminal state', async () => {
        const session = await createSession({ account, environment });

        const terminated = unwrap(
            await terminateAgentSession(db.knex, {
                id: session.id,
                accountId: account.id,
                environmentId: environment.id,
                reason: 'terminated'
            })
        );
        expect(terminated.endedAt).toBeInstanceOf(Date);
        expect(terminated.endedReason).toBe('terminated');

        const retried = unwrap(
            await terminateAgentSession(db.knex, {
                id: session.id,
                accountId: account.id,
                environmentId: environment.id,
                reason: 'expired'
            })
        );
        expect(retried.endedAt).toStrictEqual(terminated.endedAt);
        expect(retried.endedReason).toBe('terminated');
    });

    it('lists active expired sessions in expiration order and honors the limit', async () => {
        const expiredOld = await createSession({ account, environment, expiresAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
        const expiredEnded = await createSession({ account, environment, expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
        const expiredRecent = await createSession({ account, environment, expiresAt: new Date(Date.now() - 60 * 60 * 1000) });
        const active = await createSession({ account, environment, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
        unwrap(
            await terminateAgentSession(db.knex, {
                id: expiredEnded.id,
                accountId: account.id,
                environmentId: environment.id,
                reason: 'expired'
            })
        );

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
    return unwrap(
        await createAgentSession(db.knex, {
            accountId: account.id,
            environmentId: environment.id,
            resolvedConnections: {},
            compiledToolset: {},
            metaTools: { nangoProxy: false, nangoSearch: true, nangoExecute: true },
            expiresAt
        })
    );
}

function unwrap<T>(result: Result<T>): T {
    if (result.isErr()) {
        throw result.error;
    }
    return result.value;
}
