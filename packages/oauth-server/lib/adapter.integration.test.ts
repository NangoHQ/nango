import { generateKeyPairSync } from 'node:crypto';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createOAuthAdapter, deleteExpiredOAuthArtifacts, OAUTH_SERVER_ARTIFACTS_TABLE } from './adapter.js';
import { createOAuthProvider } from './provider.js';

import type { Knex } from 'knex';
import type { AdapterPayload } from 'oidc-provider';

const encryptionKey = Buffer.alloc(32, 's').toString('base64');
describe('PostgreSQL OAuth provider adapter', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    beforeEach(async () => {
        await db.knex(OAUTH_SERVER_ARTIFACTS_TABLE).delete();
    });

    it('persists encrypted artifacts across adapter instances without storing raw identifiers', async () => {
        const id = 'raw-authorization-code';
        const grantId = 'raw-grant-id';
        const payload = artifactPayload('AuthorizationCode', grantId);
        await adapter('AuthorizationCode').upsert(id, payload, 60);

        const restartedAdapter = adapter('AuthorizationCode');
        await expect(restartedAdapter.find(id)).resolves.toStrictEqual(payload);
        const row = await db
            .knex(OAUTH_SERVER_ARTIFACTS_TABLE)
            .first<{ artifact_id_hash: Buffer; grant_id_hash: Buffer; payload_encrypted: Buffer }>('artifact_id_hash', 'grant_id_hash', 'payload_encrypted');
        if (!row) throw new Error('OAuth artifact was not persisted');
        expect(row.artifact_id_hash).toHaveLength(32);
        expect(row.grant_id_hash).toHaveLength(32);
        expect(row.artifact_id_hash.toString()).not.toContain(id);
        expect(row.grant_id_hash.toString()).not.toContain(grantId);
        expect(row.payload_encrypted.toString()).not.toContain(id);
        expect(row.payload_encrypted.toString()).not.toContain(grantId);
    });

    it('restores sessions and grants across provider instances', async () => {
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const options = {
            knex: db.knex,
            config: {
                baseUrl: 'http://localhost',
                cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
                encryptionKey,
                jwks: { keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'integration-key', use: 'sig', alg: 'RS256' }] }
            },
            resources: [{ resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }]
        };
        const first = createOAuthProvider(options);
        const session = new first.Session();
        session.loginAccount({ accountId: 'account-uuid', amr: ['test'] });
        const sessionId = await session.save(60);
        const grant = new first.Grant({ accountId: 'account-uuid', clientId: 'https://client.example.com/metadata.json' });
        grant.addOIDCScope('environment:*');
        grant.addResourceScope('https://mcp.example.com/mcp', 'environment:*');
        const grantId = await grant.save();

        const second = createOAuthProvider(options);
        const restoredSession = await second.Session.find(sessionId);
        const restoredByUid = await second.Session.findByUid(session.uid);
        const restoredGrant = await second.Grant.find(grantId);

        expect(restoredSession?.accountId).toBe('account-uuid');
        expect(restoredByUid?.jti).toBe(sessionId);
        expect(restoredGrant?.getResourceScope('https://mcp.example.com/mcp')).toBe('environment:*');
    });

    it('revokes the grant when concurrent requests replay a single-use artifact', async () => {
        const refreshToken = adapter('RefreshToken');
        const accessToken = adapter('AccessToken');
        const grantId = 'grant-1';
        await refreshToken.upsert('single-use-refresh', artifactPayload('RefreshToken', grantId), 60);
        await accessToken.upsert('existing-access-token', artifactPayload('AccessToken', grantId), 60);

        const results = await Promise.allSettled([refreshToken.consume('single-use-refresh'), adapter('RefreshToken').consume('single-use-refresh')]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
        await expect(refreshToken.find('single-use-refresh')).resolves.toBeUndefined();
        await expect(accessToken.find('existing-access-token')).resolves.toBeUndefined();
        await expect(refreshToken.upsert('late-refresh', artifactPayload('RefreshToken', grantId), 60)).rejects.toThrow(/revoked OAuth grant/);
    });

    it('does not consume an artifact that expires while waiting for its row lock', async () => {
        const authorizationCode = adapter('AuthorizationCode');
        await authorizationCode.upsert('expiring-code', artifactPayload('AuthorizationCode', 'grant-expiring'), 60);
        const row = await db.knex(OAUTH_SERVER_ARTIFACTS_TABLE).where({ model: 'AuthorizationCode' }).first<{ id: string }>('id');
        if (!row) throw new Error('OAuth authorization code was not persisted');

        const blocker = await db.knex.transaction();
        const consumer = await db.knex.transaction();
        try {
            await blocker(OAUTH_SERVER_ARTIFACTS_TABLE).where({ id: row.id }).forUpdate().first('id');
            const { rows } = await consumer.raw<{ rows: { pid: number }[] }>('SELECT pg_backend_pid() AS pid');
            const backend = rows[0];
            if (!backend) throw new Error('Consumer transaction has no PostgreSQL backend');

            const consumed = adapter('AuthorizationCode', consumer).consume('expiring-code');
            await waitForDatabaseLock(backend.pid);
            await blocker(OAUTH_SERVER_ARTIFACTS_TABLE)
                .where({ id: row.id })
                .update({ expires_at: new Date(Date.now() + 100), updated_at: new Date() });
            await new Promise((resolve) => setTimeout(resolve, 150));
            await blocker.commit();

            await expect(consumed).rejects.toThrow('invalid_grant');
            await consumer.commit();
        } finally {
            if (!blocker.isCompleted()) await blocker.rollback();
            if (!consumer.isCompleted()) await consumer.rollback();
        }

        const persisted = await db.knex(OAUTH_SERVER_ARTIFACTS_TABLE).where({ id: row.id }).first<{ consumed_at: Date | null }>('consumed_at');
        expect(persisted?.consumed_at).toBeNull();
    });

    it('serializes grant revocation with artifact creation and rejects late writes', async () => {
        const grantId = 'racing-grant';
        const accessToken = adapter('AccessToken');
        const payload = artifactPayload('AccessToken', grantId);

        await Promise.allSettled([accessToken.upsert('racing-token', payload, 600), adapter('Grant').revokeByGrantId(grantId)]);

        await expect(accessToken.find('racing-token')).resolves.toBeUndefined();
        await expect(accessToken.upsert('late-token', payload, 600)).rejects.toThrow(/revoked OAuth grant/);
        const tombstone = await db.knex(OAUTH_SERVER_ARTIFACTS_TABLE).where({ model: 'GrantRevocation' }).first<{ id: string }>('id');
        expect(tombstone).toBeDefined();
    });

    it('rejects expired artifacts independently and deletes them in bounded batches', async () => {
        await adapter('AuthorizationCode').upsert('expired-code', artifactPayload('AuthorizationCode', 'grant-expired'), -10);
        await adapter('RefreshToken').upsert('expired-refresh', artifactPayload('RefreshToken', 'grant-expired'), -10);
        await adapter('AccessToken').upsert('active-token', artifactPayload('AccessToken', 'grant-active'), 600);

        await expect(adapter('AuthorizationCode').find('expired-code')).resolves.toBeUndefined();
        await expect(deleteExpiredOAuthArtifacts(db.knex, 1)).resolves.toBe(1);
        await expect(deleteExpiredOAuthArtifacts(db.knex, 1)).resolves.toBe(1);
        await expect(deleteExpiredOAuthArtifacts(db.knex, 1)).resolves.toBe(0);
        await expect(adapter('AccessToken').find('active-token')).resolves.toBeDefined();
    });

    it('does not delete an artifact renewed while cleanup waits for its row', async () => {
        const session = adapter('Session');
        await session.upsert('renewed-session', artifactPayload('Session', 'grant-renewed'), -10);
        const row = await db.knex(OAUTH_SERVER_ARTIFACTS_TABLE).where({ model: 'Session' }).first<{ id: string }>('id');
        if (!row) throw new Error('OAuth session was not persisted');

        const renewal = await db.knex.transaction();
        const cleanup = await db.knex.transaction();
        try {
            await renewal(OAUTH_SERVER_ARTIFACTS_TABLE)
                .where({ id: row.id })
                .update({ expires_at: new Date(Date.now() + 60_000), updated_at: new Date() });
            const { rows } = await cleanup.raw<{ rows: { pid: number }[] }>('SELECT pg_backend_pid() AS pid');
            const backend = rows[0];
            if (!backend) throw new Error('Cleanup transaction has no PostgreSQL backend');

            const deleted = deleteExpiredOAuthArtifacts(cleanup, 1);
            await waitForDatabaseLock(backend.pid);
            await renewal.commit();

            await expect(deleted).resolves.toBe(0);
            await cleanup.commit();
        } finally {
            if (!renewal.isCompleted()) await renewal.rollback();
            if (!cleanup.isCompleted()) await cleanup.rollback();
        }

        await expect(session.find('renewed-session')).resolves.toBeDefined();
    });

    it('fails loudly for disabled models and never persists clients', async () => {
        expect(() => adapter('DeviceCode')).toThrow('Unsupported OAuth provider model: DeviceCode');
        await expect(adapter('AuthorizationCode').findByUserCode('unused-device-code')).resolves.toBeUndefined();
        await expect(adapter('Client').upsert('https://client.example.com/metadata.json', {}, 60)).rejects.toThrow('Persisted OAuth clients are disabled');
    });
});

function adapter(model: string, knex: Knex = db.knex) {
    return createOAuthAdapter({
        knex,
        encryptionKey
    })(model);
}

function artifactPayload(kind: string, grantId: string): AdapterPayload {
    const now = Math.floor(Date.now() / 1000);
    return {
        kind,
        grantId,
        accountId: 'account-uuid',
        clientId: 'https://client.example.com/metadata.json',
        iat: now,
        exp: now + 600
    };
}

async function waitForDatabaseLock(pid: number): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        const activity = await db.knex('pg_stat_activity').where({ pid }).first<{ wait_event_type: string | null }>('wait_event_type');
        if (activity?.wait_event_type === 'Lock') return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Cleanup query did not wait for the concurrent session renewal');
}
