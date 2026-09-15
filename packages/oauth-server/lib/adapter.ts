import { errors } from 'oidc-provider';

import { createArtifactCrypto } from './crypto.js';

import type { Knex } from 'knex';
import type { Adapter, AdapterPayload } from 'oidc-provider';

export const OAUTH_SERVER_ARTIFACTS_TABLE = 'oauth_server_artifacts';
export const OAUTH_GRANT_TTL_SECONDS = 30 * 24 * 60 * 60;

const CLIENT_MODEL = 'Client';
const GRANT_MODEL = 'Grant';
const INTERACTION_MODEL = 'Interaction';
const REVOCATION_MODEL = 'GrantRevocation';
const SESSION_MODEL = 'Session';
const USER_REVOCATION_MODEL = 'UserRevocation';
const SUPPORTED_MODELS = new Set(['AccessToken', 'AuthorizationCode', 'Client', 'Grant', 'Interaction', 'RefreshToken', 'Session']);
// These are the OAuth items that belong to a grant and must be revoked with it.
// Interactions are excluded: an old OAuth cookie may belong to a different user
// than the current Nango dashboard login. When oidc-provider replaces that old
// user, it revokes the old grant. The new login interaction must remain so
// authorization can continue.
const GRANT_MEMBER_MODELS = new Set(['AccessToken', 'AuthorizationCode', 'RefreshToken']);

interface ArtifactRow {
    // Finds one OAuth item without storing its raw ID, which may be a token or authorization code.
    artifact_id_hash: Buffer;
    payload_encrypted: Buffer;
    // Links a grant to its tokens and codes so revoking the grant invalidates all of them.
    grant_id_hash: Buffer | null;
    // Links sessions and grants to a Nango user so a password change or recovery can revoke their OAuth access.
    user_id_hash: Buffer | null;
    user_authenticated_at: Date | null;
    expires_at: Date;
    consumed_at: Date | null;
    revoked_at: Date | null;
}

interface OAuthAdapterOptions {
    knex: Knex;
    encryptionKey: string;
}

export function hashOAuthIdentifier(value: string, encryptionKey: string): Buffer {
    return createArtifactCrypto(encryptionKey).hash(value);
}

export async function claimOAuthInteraction({ knex, encryptionKey, interactionId }: OAuthAdapterOptions & { interactionId: string }): Promise<boolean> {
    const now = new Date();
    const claimed = await knex(OAUTH_SERVER_ARTIFACTS_TABLE)
        .where({ model: INTERACTION_MODEL, artifact_id_hash: hashOAuthIdentifier(interactionId, encryptionKey), consumed_at: null, revoked_at: null })
        .where('expires_at', '>', now)
        .update({ consumed_at: now, updated_at: now });
    return claimed === 1;
}

export async function releaseOAuthInteraction({ knex, encryptionKey, interactionId }: OAuthAdapterOptions & { interactionId: string }): Promise<void> {
    await knex(OAUTH_SERVER_ARTIFACTS_TABLE)
        .where({ model: INTERACTION_MODEL, artifact_id_hash: hashOAuthIdentifier(interactionId, encryptionKey) })
        .whereNotNull('consumed_at')
        .update({ consumed_at: null, updated_at: new Date() });
}

export async function revokeOAuthGrant({ knex, encryptionKey, grantId }: OAuthAdapterOptions & { grantId: string }): Promise<void> {
    await knex.transaction(async (trx) => {
        const grantIdHash = hashOAuthIdentifier(grantId, encryptionKey);
        await lockGrant(trx, grantIdHash);
        await revokeGrant(trx, createArtifactCrypto(encryptionKey), grantIdHash, new Date());
    });
}

export async function revokeOAuthUserInTransaction({
    trx,
    encryptionKey,
    userId
}: {
    trx: Knex.Transaction;
    encryptionKey: string;
    userId: string;
}): Promise<void> {
    const crypto = createArtifactCrypto(encryptionKey);
    const userIdHash = crypto.hash(userId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OAUTH_GRANT_TTL_SECONDS * 1000);
    const payloadEncrypted = await crypto.encrypt(USER_REVOCATION_MODEL, userIdHash, {});
    await lockUser(trx, userIdHash);

    await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
        .insert({
            model: USER_REVOCATION_MODEL,
            artifact_id_hash: userIdHash,
            payload_encrypted: payloadEncrypted,
            grant_id_hash: null,
            session_uid_hash: null,
            user_id_hash: userIdHash,
            user_authenticated_at: null,
            expires_at: expiresAt,
            consumed_at: null,
            revoked_at: now,
            created_at: now,
            updated_at: now
        })
        .onConflict(['model', 'artifact_id_hash'])
        .merge({ payload_encrypted: payloadEncrypted, expires_at: expiresAt, revoked_at: now, updated_at: now });

    await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
        .where({ model: SESSION_MODEL, user_id_hash: userIdHash })
        .whereNull('revoked_at')
        .update({ revoked_at: now, updated_at: now });

    const candidates = await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
        .where({ model: GRANT_MODEL, user_id_hash: userIdHash })
        .whereNull('revoked_at')
        .where('expires_at', '>', now)
        .select<Pick<ArtifactRow, 'artifact_id_hash'>[]>('artifact_id_hash');
    for (const row of candidates.sort((left, right) => Buffer.compare(left.artifact_id_hash, right.artifact_id_hash))) {
        await lockGrant(trx, row.artifact_id_hash);
    }
    const grantRows = await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
        .where({ model: GRANT_MODEL, user_id_hash: userIdHash })
        .whereNull('revoked_at')
        .where('expires_at', '>', now)
        .forUpdate()
        .select<Pick<ArtifactRow, 'artifact_id_hash'>[]>('artifact_id_hash');
    for (const row of grantRows) {
        await revokeGrant(trx, crypto, row.artifact_id_hash, now);
    }
}

export function createOAuthAdapter(options: OAuthAdapterOptions): (model: string) => Adapter {
    return (model) => new PostgresOAuthAdapter(model, options);
}

class PostgresOAuthAdapter implements Adapter {
    private readonly crypto;

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
        const grantId = this.model === GRANT_MODEL ? id : GRANT_MEMBER_MODELS.has(this.model) ? payload.grantId : undefined;
        const grantIdHash = grantId ? this.crypto.hash(grantId) : null;
        // accountId is oidc-provider's name for the OAuth subject; its value here is the Nango user ID.
        const userId = (this.model === SESSION_MODEL || this.model === GRANT_MODEL) && typeof payload.accountId === 'string' ? payload.accountId : null;
        const userIdHash = userId ? this.crypto.hash(userId) : null;
        const userAuthenticatedAt = userAuthenticationTime(this.model, payload, userId);
        const now = new Date();
        const consumedAt = payload.consumed ? new Date(Number(payload.consumed) * 1000) : null;
        const mutableFields = {
            payload_encrypted: await this.crypto.encrypt(this.model, artifactIdHash, payload),
            grant_id_hash: grantIdHash,
            session_uid_hash: payload.uid ? this.crypto.hash(payload.uid) : null,
            user_id_hash: userIdHash,
            user_authenticated_at: userAuthenticatedAt,
            expires_at: expiration(payload, expiresIn),
            revoked_at: null,
            updated_at: now
        };
        // A consent decision atomically claims an Interaction via consumed_at. oidc-provider
        // subsequently persists its result, which must not make the interaction claimable again.
        const mergedFields = this.model === INTERACTION_MODEL && !payload.consumed ? mutableFields : { ...mutableFields, consumed_at: consumedAt };

        await this.options.knex.transaction(async (trx) => {
            if (userIdHash) {
                await lockUser(trx, userIdHash);
            }
            if (grantIdHash) {
                await lockGrant(trx, grantIdHash);
            }

            const [upserted] = await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
                .insert(
                    trx.raw(
                        `(
                            model, artifact_id_hash, payload_encrypted, grant_id_hash, session_uid_hash,
                            user_id_hash, user_authenticated_at, expires_at, consumed_at, revoked_at, created_at, updated_at
                        )
                        SELECT
                            :model, :artifactIdHash, :payloadEncrypted, :grantIdHash, :sessionUidHash,
                            :userIdHash, :userAuthenticatedAt, :expiresAt, :consumedAt, :revokedAt, :createdAt, :updatedAt
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM :table:
                            WHERE model = :revocationModel
                                AND artifact_id_hash = :grantIdHash
                                AND expires_at > :updatedAt
                        )
                            AND NOT EXISTS (
                                SELECT 1
                                FROM :table:
                                WHERE model = :userRevocationModel
                                    AND artifact_id_hash = :userIdHash
                                    AND revoked_at >= :userAuthenticatedAt
                                    AND expires_at > :updatedAt
                            )`,
                        {
                            table: OAUTH_SERVER_ARTIFACTS_TABLE,
                            revocationModel: REVOCATION_MODEL,
                            userRevocationModel: USER_REVOCATION_MODEL,
                            model: this.model,
                            artifactIdHash,
                            payloadEncrypted: mutableFields.payload_encrypted,
                            grantIdHash,
                            sessionUidHash: mutableFields.session_uid_hash,
                            userIdHash,
                            userAuthenticatedAt,
                            expiresAt: mutableFields.expires_at,
                            consumedAt,
                            revokedAt: mutableFields.revoked_at,
                            createdAt: now,
                            updatedAt: mutableFields.updated_at
                        }
                    )
                )
                .onConflict(['model', 'artifact_id_hash'])
                .merge(mergedFields)
                .returning<Pick<ArtifactRow, 'artifact_id_hash'>[]>('artifact_id_hash');
            if (!upserted) {
                throw new Error('Cannot persist an artifact for a revoked OAuth grant or session');
            }
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
        const outcome = await this.options.knex.transaction(async (trx) => {
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
                    await revokeGrant(trx, this.crypto, row.grant_id_hash, consumedAt);
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
        await this.options
            .knex(OAUTH_SERVER_ARTIFACTS_TABLE)
            .where({ model: this.model, artifact_id_hash: this.crypto.hash(id) })
            .delete();
    }

    async revokeByGrantId(grantId: string): Promise<void> {
        const grantIdHash = this.crypto.hash(grantId);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + OAUTH_GRANT_TTL_SECONDS * 1000);

        await this.options.knex.transaction(async (trx) => {
            await lockGrant(trx, grantIdHash);
            await revokeGrant(trx, this.crypto, grantIdHash, now, expiresAt);
        });
    }

    private async findByHash(column: 'artifact_id_hash' | 'session_uid_hash', hash: Buffer): Promise<AdapterPayload | undefined> {
        if (this.model === CLIENT_MODEL) {
            return undefined;
        }

        const row = await this.options
            .knex(OAUTH_SERVER_ARTIFACTS_TABLE)
            .where({ model: this.model, revoked_at: null })
            .where(column, hash)
            .where('expires_at', '>', new Date())
            .first<ArtifactRow>('artifact_id_hash', 'payload_encrypted', 'consumed_at');
        if (!row) {
            return undefined;
        }

        const payload = await this.crypto.decrypt<AdapterPayload>(this.model, row.artifact_id_hash, row.payload_encrypted);
        if (row.consumed_at) {
            payload.consumed = Math.floor(row.consumed_at.getTime() / 1000);
        }
        return payload;
    }
}

async function revokeGrant(
    trx: Knex.Transaction,
    crypto: ReturnType<typeof createArtifactCrypto>,
    grantIdHash: Buffer,
    revokedAt: Date,
    expiresAt = new Date(revokedAt.getTime() + OAUTH_GRANT_TTL_SECONDS * 1000)
): Promise<void> {
    await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
        .insert({
            model: REVOCATION_MODEL,
            artifact_id_hash: grantIdHash,
            payload_encrypted: await crypto.encrypt(REVOCATION_MODEL, grantIdHash, {}),
            grant_id_hash: grantIdHash,
            session_uid_hash: null,
            user_id_hash: null,
            user_authenticated_at: null,
            expires_at: expiresAt,
            consumed_at: null,
            revoked_at: revokedAt,
            created_at: revokedAt,
            updated_at: revokedAt
        })
        .onConflict(['model', 'artifact_id_hash'])
        .merge({ expires_at: expiresAt, revoked_at: revokedAt, updated_at: revokedAt });

    await trx(OAUTH_SERVER_ARTIFACTS_TABLE)
        .where({ grant_id_hash: grantIdHash })
        .whereNot({ model: REVOCATION_MODEL })
        .update({ revoked_at: revokedAt, updated_at: revokedAt });
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

function userAuthenticationTime(model: string, payload: AdapterPayload, userId: string | null): Date | null {
    if (!userId) return null;
    const timestamp = model === SESSION_MODEL ? payload.loginTs : model === GRANT_MODEL ? payload.iat : undefined;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
        throw new Error('Authenticated OAuth sessions and grants require a valid authentication timestamp');
    }
    return new Date(timestamp * 1000);
}

async function lockGrant(trx: Knex.Transaction, grantIdHash: Buffer): Promise<void> {
    await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [grantIdHash.toString('base64url')]);
}

async function lockUser(trx: Knex.Transaction, userIdHash: Buffer): Promise<void> {
    await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [`oauth-user:${userIdHash.toString('base64url')}`]);
}

export async function deleteExpiredOAuthArtifacts(knex: Knex, limit: number): Promise<number> {
    const expiresAt = new Date();
    return await knex(OAUTH_SERVER_ARTIFACTS_TABLE)
        .where('expires_at', '<=', expiresAt)
        .whereIn('id', knex(OAUTH_SERVER_ARTIFACTS_TABLE).select('id').where('expires_at', '<=', expiresAt).orderBy('expires_at', 'asc').limit(limit))
        .delete();
}
