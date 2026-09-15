import { generateKeyPairSync } from 'node:crypto';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import {
    claimOAuthInteraction,
    createOAuthAdapter,
    deleteExpiredOAuthArtifacts,
    OAUTH_SERVER_ARTIFACTS_TABLE,
    releaseOAuthInteraction,
    revokeOAuthGrant,
    revokeOAuthUserInTransaction
} from './adapter.js';
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

    it('rejects artifacts missing identifiers required for revocation', async () => {
        await expect(adapter('AccessToken').upsert('access-token', { kind: 'AccessToken' }, 60)).rejects.toThrow('AccessToken OAuth artifacts require grantId');
        await expect(adapter('RefreshToken').upsert('refresh-token', { kind: 'RefreshToken' }, 60)).rejects.toThrow(
            'RefreshToken OAuth artifacts require grantId'
        );
        await expect(adapter('AuthorizationCode').upsert('authorization-code', { kind: 'AuthorizationCode' }, 60)).rejects.toThrow(
            'AuthorizationCode OAuth artifacts require grantId'
        );
        await expect(adapter('Grant').upsert('grant', { kind: 'Grant' }, 60)).rejects.toThrow('Grant OAuth artifacts require accountId');
        await expect(adapter('Session').upsert('invalid-session', { kind: 'Session', accountId: '' }, 60)).rejects.toThrow(
            'Session OAuth artifacts require accountId to be a non-empty string when present'
        );
    });

    it('allows OAuth artifacts that do not belong to a user or grant', async () => {
        await expect(adapter('Session').upsert('anonymous-session', { kind: 'Session' }, 60)).resolves.toBeUndefined();
        await expect(
            adapter('Interaction').upsert(
                'login-interaction',
                { kind: 'Interaction', params: {}, prompt: { name: 'login', reasons: [], details: {} }, returnTo: '/oauth/authorize' },
                60
            )
        ).resolves.toBeUndefined();
    });

    it('restores sessions and grants across provider instances', async () => {
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const options = {
            knex: db.knex,
            userExists: () => true,
            config: {
                baseUrl: 'http://localhost',
                cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
                encryptionKey,
                jwks: { keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'integration-key', use: 'sig', alg: 'RS256' }] }
            },
            resource: { resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] },
            interactionUrl: (uid: string) => `/oauth/interaction/${encodeURIComponent(uid)}`
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

    it('revokes a grant and its provider artifacts', async () => {
        const grantId = 'grant-to-revoke';
        await adapter('Grant').upsert(
            grantId,
            {
                ...artifactPayload('Grant', grantId),
                accountId: 'user-42',
                resources: { 'https://mcp.example.com/mcp': 'environment:*' }
            },
            600
        );
        await adapter('AccessToken').upsert('grant-access-token', artifactPayload('AccessToken', grantId), 600);

        await expect(revokeOAuthGrant({ knex: db.knex, encryptionKey, grantId })).resolves.toBeUndefined();
        await expect(adapter('Grant').find(grantId)).resolves.toBeUndefined();
        await expect(adapter('AccessToken').find('grant-access-token')).resolves.toBeUndefined();
        await expect(revokeOAuthGrant({ knex: db.knex, encryptionKey, grantId })).resolves.toBeUndefined();
    });

    it('preserves an in-progress interaction when its previous grant is revoked', async () => {
        // 1. A browser has an old OAuth grant for one Nango user.
        // 2. The current dashboard login belongs to a different Nango user.
        // 3. oidc-provider revokes the old grant before continuing with the current user.
        // 4. The new login interaction must survive so authorization can continue.
        const grantId = 'grant-before-account-switch';
        const interactionId = 'account-switch-interaction';
        await adapter('Grant').upsert(grantId, { ...artifactPayload('Grant', grantId), accountId: 'original-user' }, 600);
        await adapter('Interaction').upsert(
            interactionId,
            {
                ...artifactPayload('Interaction', grantId),
                params: {},
                prompt: { name: 'login', reasons: [], details: {} },
                returnTo: `/oauth/authorize/${interactionId}`
            },
            600
        );

        await adapter('AccessToken').revokeByGrantId(grantId);

        await expect(adapter('Grant').find(grantId)).resolves.toBeUndefined();
        await expect(adapter('Interaction').find(interactionId)).resolves.toBeDefined();
    });

    it('allows only one consent decision to claim an interaction', async () => {
        // 1. Two consent requests race to answer the same interaction.
        // 2. Only one request may claim it.
        // 3. Saving oidc-provider's result must not make it claimable again.
        // 4. Releasing the interaction after a failed request allows one retry.
        const interactionId = 'concurrent-consent';
        const interaction = adapter('Interaction');
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            kind: 'Interaction',
            iat: now,
            exp: now + 600,
            params: {},
            prompt: { name: 'consent', reasons: [], details: {} },
            returnTo: '/oauth/authorize/concurrent-consent'
        } satisfies AdapterPayload;
        await interaction.upsert(interactionId, payload, 600);

        const claims = await Promise.all([
            claimOAuthInteraction({ knex: db.knex, encryptionKey, interactionId }),
            claimOAuthInteraction({ knex: db.knex, encryptionKey, interactionId })
        ]);
        expect(claims.sort()).toStrictEqual([false, true]);

        await interaction.upsert(interactionId, { ...payload, result: { error: 'access_denied' } }, 600);
        await expect(claimOAuthInteraction({ knex: db.knex, encryptionKey, interactionId })).resolves.toBe(false);

        await releaseOAuthInteraction({ knex: db.knex, encryptionKey, interactionId });
        await expect(claimOAuthInteraction({ knex: db.knex, encryptionKey, interactionId })).resolves.toBe(true);
    });

    it('revokes a user session and grants while rejecting stale in-flight writes', async () => {
        // 1. A password change revokes the user's existing OAuth session and grants.
        // 2. Writes from an authentication that started before the change must be rejected.
        // 3. Sessions and grants from a new authentication after the change are allowed.
        const session = adapter('Session');
        const grant = adapter('Grant');
        const userId = 'user-42';
        const staleSession = {
            ...artifactPayload('Session', 'unused'),
            accountId: userId,
            loginTs: Date.now() / 1000 - 60,
            uid: 'session-uid'
        };
        const staleGrant = {
            ...artifactPayload('Grant', 'original-grant'),
            accountId: userId,
            iat: staleSession.loginTs,
            resources: { 'https://mcp.example.com/mcp': 'environment:*' }
        };
        await session.upsert('original-session', staleSession, 600);
        await grant.upsert('original-grant', staleGrant, 600);

        await db.knex.transaction(async (trx) => {
            await revokeOAuthUserInTransaction({ trx, encryptionKey, userId });
        });

        await expect(session.find('original-session')).resolves.toBeUndefined();
        await expect(grant.find('original-grant')).resolves.toBeUndefined();
        await expect(session.upsert('rotated-stale-session', staleSession, 600)).rejects.toThrow(/revoked OAuth grant or session/);
        await expect(grant.upsert('late-stale-grant', staleGrant, 600)).rejects.toThrow(/revoked OAuth grant or session/);

        const freshAuthentication = Date.now() / 1000 + 1;
        const freshSession = { ...staleSession, loginTs: freshAuthentication, uid: 'fresh-session-uid' };
        const freshGrant = { ...staleGrant, iat: freshAuthentication };
        await expect(session.upsert('fresh-session', freshSession, 600)).resolves.toBeUndefined();
        await expect(grant.upsert('fresh-grant', freshGrant, 600)).resolves.toBeUndefined();
        await expect(session.find('fresh-session')).resolves.toMatchObject({ accountId: userId });
        await expect(grant.find('fresh-grant')).resolves.toMatchObject({ accountId: userId });
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
        exp: now + 600,
        // oidc-provider records a session's authentication time as loginTs; grants use iat.
        ...(kind === 'Session' ? { loginTs: now } : {})
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
