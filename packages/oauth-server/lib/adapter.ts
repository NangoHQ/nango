import { AsyncLocalStorage } from 'node:async_hooks';

import { errors } from 'oidc-provider';

import { createArtifactCrypto } from './crypto.js';

import type { Knex } from 'knex';
import type { Adapter, AdapterPayload } from 'oidc-provider';

export const OAUTH_SERVER_ARTIFACTS_TABLE = 'oauth_server_artifacts';
export const OAUTH_GRANT_TTL_SECONDS = 30 * 24 * 60 * 60;

const CLIENT_MODEL = 'Client';
const REVOCATION_MODEL = 'GrantRevocation';
const SUPPORTED_MODELS = new Set(['AccessToken', 'AuthorizationCode', 'Client', 'Grant', 'Interaction', 'RefreshToken', 'Session']);
const transactions = new AsyncLocalStorage<Knex.Transaction>();

/** Share the embedding application's transaction with provider persistence for this async call only. */
export function withOAuthTransaction<T>(trx: Knex.Transaction, fn: () => Promise<T>): Promise<T> {
    return transactions.run(trx, fn);
}

/** Wait for the application transaction, not an adapter savepoint, to commit. */
export function oauthTransactionCommitted(trx: Knex.Transaction): Promise<unknown> {
    return (transactions.getStore() ?? trx).executionPromise;
}

interface ArtifactRow {
    artifact_id_hash: Buffer;
    payload_encrypted: Buffer;
    grant_id_hash: Buffer | null;
    expires_at: Date;
    consumed_at: Date | null;
    revoked_at: Date | null;
}

export interface OAuthAdapterOptions {
    knex: Knex;
    encryptionKey: string;
    beforeGrantRevoked?: ((trx: Knex.Transaction, grantIdHash: Buffer) => Promise<void>) | undefined;
}

export function createOAuthAdapter(options: OAuthAdapterOptions): (model: string) => Adapter {
    return (model) => new PostgresOAuthAdapter(model, options);
}

class PostgresOAuthAdapter implements Adapter {
    private readonly crypto;

    private get knex(): Knex {
        return transactions.getStore() ?? this.options.knex;
    }

    constructor(
        private readonly model: string,
        private readonly options: OAuthAdapterOptions
    ) {
        if (!SUPPORTED_MODELS.has(model)) {
            throw new Error(`Unsupported OAuth provider model: ${model}`);
        }
        this.crypto = createArtifactCrypto(options.encryptionKey);
    }

    async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
        if (this.model === CLIENT_MODEL) {
            throw new Error('Persisted OAuth clients are disabled; only CIMD clients are supported');
        }

        const artifactIdHash = this.crypto.hash(id);
        const grantId = this.model === 'Grant' ? id : payload.grantId;
        const grantIdHash = grantId ? this.crypto.hash(grantId) : null;
        const now = new Date();
        const mutableFields = {
            payload_encrypted: this.crypto.encrypt(this.model, artifactIdHash, payload),
            grant_id_hash: grantIdHash,
            session_uid_hash: payload.uid ? this.crypto.hash(payload.uid) : null,
            expires_at: expiration(payload, expiresIn),
            consumed_at: payload.consumed ? new Date(Number(payload.consumed) * 1000) : null,
            revoked_at: null,
            updated_at: now
        };

        await this.knex.transaction(async (trx) => {
            if (grantIdHash) {
                await lockGrant(trx, grantIdHash);
                const revoked = await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
                    .where({ model: REVOCATION_MODEL, artifact_id_hash: grantIdHash })
                    .where('expires_at', '>', now)
                    .first<Pick<ArtifactRow, 'artifact_id_hash'>>('artifact_id_hash');
                if (revoked) {
                    throw new Error('Cannot persist an artifact for a revoked OAuth grant');
                }
            }

            await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
                .insert({
                    model: this.model,
                    artifact_id_hash: artifactIdHash,
                    ...mutableFields,
                    created_at: now
                })
                .onConflict(['model', 'artifact_id_hash'])
                .merge(mutableFields);
        });
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
        if (this.model === CLIENT_MODEL) {
            return undefined;
        }
        return await this.findByHash('artifact_id_hash', this.crypto.hash(id));
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
        return await this.findByHash('session_uid_hash', this.crypto.hash(uid));
    }

    findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
        void userCode;
        return Promise.resolve(undefined);
    }

    async consume(id: string): Promise<void> {
        const artifactIdHash = this.crypto.hash(id);
        const outcome = await this.knex.transaction(async (trx) => {
            // Read the immutable grant hash first so every grant-related operation acquires
            // the advisory lock before taking row locks. This avoids a lock-order deadlock
            // with concurrent grant revocation.
            const grant = await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
                .where({ model: this.model, artifact_id_hash: artifactIdHash })
                .first<Pick<ArtifactRow, 'grant_id_hash'>>('grant_id_hash');
            if (grant?.grant_id_hash) {
                await lockGrant(trx, grant.grant_id_hash);
            }

            const row = await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
                .where({ model: this.model, artifact_id_hash: artifactIdHash })
                .forUpdate()
                .first<ArtifactRow>('artifact_id_hash', 'payload_encrypted', 'grant_id_hash', 'expires_at', 'consumed_at', 'revoked_at');
            const consumedAt = new Date();
            if (!row || row.revoked_at || row.expires_at <= consumedAt) {
                return 'invalid';
            }
            if (row.consumed_at) {
                if (row.grant_id_hash) {
                    await revokeOAuthGrantArtifactsInTransaction({
                        trx,
                        encryptionKey: this.options.encryptionKey,
                        grantIdHash: row.grant_id_hash,
                        beforeGrantRevoked: this.options.beforeGrantRevoked,
                        payload: { reason: 'artifact_replay' }
                    });
                }
                return 'replayed';
            }

            const updated = await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
                .where({ model: this.model, artifact_id_hash: artifactIdHash, consumed_at: null, revoked_at: null })
                .where('expires_at', '>', consumedAt)
                .update({ consumed_at: consumedAt, updated_at: consumedAt });
            if (updated !== 1) {
                throw new Error('OAuth artifact changed while locked for consumption');
            }
            return 'consumed';
        });

        if (outcome === 'replayed') {
            throw new errors.InvalidGrant('OAuth artifact was already consumed; its grant has been revoked');
        }
        if (outcome === 'invalid') {
            throw new errors.InvalidGrant('OAuth artifact is expired, revoked, or missing');
        }
    }

    async destroy(id: string): Promise<void> {
        if (this.model === CLIENT_MODEL) {
            return;
        }
        await this.knex(OAUTH_SERVER_ARTIFACTS_TABLE)
            .where({ model: this.model, artifact_id_hash: this.crypto.hash(id) })
            .delete();
    }

    async revokeByGrantId(grantId: string): Promise<void> {
        const grantIdHash = this.crypto.hash(grantId);
        await this.knex.transaction(async (trx) => {
            await revokeOAuthGrantArtifactsInTransaction({
                trx,
                encryptionKey: this.options.encryptionKey,
                grantIdHash,
                beforeGrantRevoked: this.options.beforeGrantRevoked,
                payload: { grantId }
            });
        });
    }

    private async findByHash(column: 'artifact_id_hash' | 'session_uid_hash', hash: Buffer): Promise<AdapterPayload | undefined> {
        if (this.model === CLIENT_MODEL) {
            return undefined;
        }

        const row = await this.knex(OAUTH_SERVER_ARTIFACTS_TABLE)
            .where({ model: this.model, revoked_at: null })
            .where(column, hash)
            .where('expires_at', '>', new Date())
            .first<ArtifactRow>('artifact_id_hash', 'payload_encrypted', 'consumed_at');
        if (!row) {
            return undefined;
        }

        const payload = this.crypto.decrypt<AdapterPayload>(this.model, row.artifact_id_hash, row.payload_encrypted);
        if (row.consumed_at) {
            payload.consumed = Math.floor(row.consumed_at.getTime() / 1000);
        }
        return payload;
    }
}

export function hashOAuthGrantId(encryptionKey: string, grantId: string): Buffer {
    return createArtifactCrypto(encryptionKey).hash(grantId);
}

export async function revokeOAuthGrantArtifactsInTransaction({
    trx,
    encryptionKey,
    grantIdHash,
    beforeGrantRevoked,
    payload = { reason: 'product_grant_revoked' }
}: {
    trx: Knex.Transaction;
    encryptionKey: string;
    grantIdHash: Buffer;
    beforeGrantRevoked?: ((trx: Knex.Transaction, grantIdHash: Buffer) => Promise<void>) | undefined;
    payload?: Record<string, string> | undefined;
}): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OAUTH_GRANT_TTL_SECONDS * 1000);
    const crypto = createArtifactCrypto(encryptionKey);

    await lockGrant(trx, grantIdHash);
    // Nango's product binding is the resource server's fail-closed source of truth. Let the
    // embedding application invalidate it before any provider artifacts are touched.
    await beforeGrantRevoked?.(trx, grantIdHash);

    await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
        .insert({
            model: REVOCATION_MODEL,
            artifact_id_hash: grantIdHash,
            payload_encrypted: crypto.encrypt(REVOCATION_MODEL, grantIdHash, payload),
            grant_id_hash: grantIdHash,
            session_uid_hash: null,
            expires_at: expiresAt,
            consumed_at: null,
            revoked_at: now,
            created_at: now,
            updated_at: now
        })
        .onConflict(['model', 'artifact_id_hash'])
        .merge({ expires_at: expiresAt, revoked_at: now, updated_at: now });

    await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
        .where({ grant_id_hash: grantIdHash })
        .whereNot({ model: REVOCATION_MODEL })
        .update({ revoked_at: now, updated_at: now });
}

function expiration(payload: AdapterPayload, expiresIn: number | undefined): Date {
    if (typeof expiresIn === 'number') {
        return new Date(Date.now() + expiresIn * 1000);
    }
    if (typeof payload.exp === 'number') {
        return new Date(payload.exp * 1000);
    }
    return new Date(Date.now() + OAUTH_GRANT_TTL_SECONDS * 1000);
}

async function lockGrant(trx: Knex.Transaction, grantIdHash: Buffer): Promise<void> {
    await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [grantIdHash.toString('base64url')]);
}

export async function deleteExpiredOAuthArtifacts(knex: Knex, limit: number): Promise<number> {
    const expiresAt = new Date();
    return await knex(OAUTH_SERVER_ARTIFACTS_TABLE)
        .where('expires_at', '<=', expiresAt)
        .whereIn('id', knex(OAUTH_SERVER_ARTIFACTS_TABLE).select('id').where('expires_at', '<=', expiresAt).orderBy('expires_at', 'asc').limit(limit))
        .delete();
}
