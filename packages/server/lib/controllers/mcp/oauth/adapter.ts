import crypto from 'node:crypto';

import db from '@nangohq/database';
import { metrics } from '@nangohq/utils';

import type { Adapter, AdapterPayload } from 'oidc-provider';

const TABLE = '_nango_mcp_oauth_provider_artifacts';
const ALLOWED_MODELS = new Set(['AccessToken', 'AuthorizationCode', 'Client', 'Grant', 'Interaction', 'RefreshToken', 'ReplayDetection', 'Session']);

interface ArtifactRow {
    model: string;
    artifact_id_hash: string;
    artifact_id_encrypted: string;
    payload: AdapterPayload;
    expires_at: Date | string | null;
    consumed_at: Date | string | null;
    grant_id: string | null;
    session_uid: string | null;
    user_code: string | null;
    created_at: Date;
    updated_at: Date;
}

export class ManagementMcpOAuthAdapter implements Adapter {
    private readonly encryptionKey: Buffer;
    private readonly hashingKey: Buffer;

    constructor(
        private readonly model: string,
        secret: string
    ) {
        if (!ALLOWED_MODELS.has(model)) {
            throw new Error(`Unsupported oidc-provider adapter model: ${model}`);
        }
        this.encryptionKey = crypto.createHash('sha256').update(`encryption:${secret}`).digest();
        this.hashingKey = crypto.createHash('sha256').update(`hashing:${secret}`).digest();
    }

    async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
        await this.execute('upsert', async () => {
            const storedPayload = structuredClone(payload);
            delete storedPayload.jti;

            const now = new Date();
            const row = {
                model: this.model,
                artifact_id_hash: hashArtifactId(id, this.hashingKey),
                artifact_id_encrypted: this.encrypt(id),
                payload: storedPayload,
                expires_at: expiresIn === undefined ? null : new Date(Date.now() + expiresIn * 1000),
                consumed_at: payload.consumed ? new Date(Number(payload.consumed) * 1000) : null,
                grant_id: typeof payload.grantId === 'string' ? payload.grantId : null,
                session_uid: typeof payload.uid === 'string' ? payload.uid : typeof payload.sessionUid === 'string' ? payload.sessionUid : null,
                user_code: typeof payload.userCode === 'string' ? payload.userCode : null,
                updated_at: now
            };

            await db
                .knex<ArtifactRow>(TABLE)
                .insert({ ...row, created_at: now } as never)
                .onConflict(['model', 'artifact_id_hash'])
                .merge(row as never);
        });
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
        return await this.execute('find', async () => {
            const row = await db
                .knex<ArtifactRow>(TABLE)
                .where({ model: this.model, artifact_id_hash: hashArtifactId(id, this.hashingKey) })
                .first();
            return this.toPayload(row, id);
        });
    }

    async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
        return await this.execute('findByUserCode', async () => {
            const row = await db.knex<ArtifactRow>(TABLE).where({ model: this.model, user_code: userCode }).first();
            return this.toPayload(row);
        });
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
        return await this.execute('findByUid', async () => {
            const row = await db.knex<ArtifactRow>(TABLE).where({ model: this.model, session_uid: uid }).first();
            return this.toPayload(row);
        });
    }

    async consume(id: string): Promise<void> {
        await this.execute('consume', async () => {
            const consumedAt = new Date();
            await db
                .knex<ArtifactRow>(TABLE)
                .where({ model: this.model, artifact_id_hash: hashArtifactId(id, this.hashingKey) })
                .whereNull('consumed_at')
                .update({ consumed_at: consumedAt, updated_at: consumedAt });
        });
    }

    async destroy(id: string): Promise<void> {
        await this.execute('destroy', async () => {
            await db
                .knex<ArtifactRow>(TABLE)
                .where({ model: this.model, artifact_id_hash: hashArtifactId(id, this.hashingKey) })
                .delete();
        });
    }

    async revokeByGrantId(grantId: string): Promise<void> {
        await this.execute('revokeByGrantId', async () => {
            await db
                .knex<ArtifactRow>(TABLE)
                .where({ model: this.model, grant_id: grantId })
                .update({
                    payload: db.knex.raw(`payload || '{"__nango_revoked":true}'::jsonb`),
                    updated_at: new Date()
                });
        });
    }

    private toPayload(row: ArtifactRow | undefined, knownId?: string): AdapterPayload | undefined {
        if (!row || row.payload['__nango_revoked'] === true || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) {
            return undefined;
        }

        const payload: AdapterPayload = { ...row.payload, jti: knownId ?? this.decrypt(row.artifact_id_encrypted) };
        if (row.consumed_at) {
            payload.consumed = Math.floor(new Date(row.consumed_at).getTime() / 1000);
        }
        return payload;
    }

    private encrypt(id: string): string {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(id, 'utf8'), cipher.final()]);
        return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
    }

    private decrypt(value: string): string {
        const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
        if (!iv || !tag || !encrypted) {
            throw new Error('Invalid encrypted OAuth artifact identifier');
        }
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    }

    private async execute<T>(operation: string, callback: () => Promise<T>): Promise<T> {
        try {
            return await callback();
        } catch (err) {
            metrics.increment(metrics.Types.MCP_OAUTH_ADAPTER_FAILURE, 1, { model: this.model, operation });
            throw err;
        }
    }
}

export async function managementMcpOAuthArtifactExists(model: string, id: string, secret: string): Promise<boolean> {
    const hashingKey = crypto.createHash('sha256').update(`hashing:${secret}`).digest();
    const row = await db
        .knex<ArtifactRow>(TABLE)
        .select('artifact_id_hash')
        .where({ model, artifact_id_hash: hashArtifactId(id, hashingKey) })
        .first();
    return Boolean(row);
}

function hashArtifactId(id: string, key: Buffer): string {
    return crypto.createHmac('sha256', key).update(id).digest('hex');
}

export async function deleteExpiredManagementMcpOAuthArtifacts(limit = 1_000): Promise<number> {
    const ids = await db.knex<ArtifactRow>(TABLE).select(['model', 'artifact_id_hash']).where('expires_at', '<=', new Date()).limit(limit);
    if (ids.length === 0) {
        return 0;
    }

    const deleted = await db
        .knex<ArtifactRow>(TABLE)
        .whereIn(
            ['model', 'artifact_id_hash'],
            ids.map((row) => [row.model, row.artifact_id_hash])
        )
        .delete();
    return deleted;
}
