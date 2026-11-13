import { generateKeyPairSync } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK } from 'jose';

import { Err, Ok } from '@nangohq/utils';

import { INSTALLATION_KEYS_TABLE } from '../db/schema.js';
import { inserted, orMissing, table } from './db.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallationKey } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const keys = (db: RegistryDb) => table<DBSelfHostingInstallationKey>(db, INSTALLATION_KEYS_TABLE);

/** The private half is returned once and never stored. */
export async function createInstallationKey(
    db: RegistryDb,
    { installationId }: { installationId: number }
): Promise<Result<{ key: DBSelfHostingInstallationKey; privateKeyPem: string }>> {
    try {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const kid = await calculateJwkThumbprint(await exportJWK(publicKey));
        const row = await keys(db)
            .insert({ installation_id: installationId, kid, public_key: publicKey.export({ type: 'spki', format: 'pem' }).toString() })
            .returning('*');
        return Ok({ key: inserted(row), privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
    } catch (err) {
        return Err(err);
    }
}

export async function listInstallationKeys(
    db: RegistryDb,
    { installationId, includeDeleted = false }: { installationId: number; includeDeleted?: boolean }
): Promise<Result<DBSelfHostingInstallationKey[]>> {
    try {
        return Ok(
            await keys(db)
                .where({ installation_id: installationId, ...(!includeDeleted && { deleted_at: null }) })
                .orderBy('id')
        );
    } catch (err) {
        return Err(err);
    }
}

export async function deleteInstallationKey(db: RegistryDb, { kid }: { kid: string }): Promise<Result<DBSelfHostingInstallationKey>> {
    try {
        const [row] = await keys(db).where({ kid, deleted_at: null }).update({ deleted_at: new Date() }).returning('*');
        return row ? Ok(row) : Err(new Error(`no live key ${kid}`));
    } catch (err) {
        return Err(err);
    }
}

export async function getInstallationKey(db: RegistryDb, { kid }: { kid: string }): Promise<Result<DBSelfHostingInstallationKey | null>> {
    try {
        return Ok((await keys(db).where({ kid, deleted_at: null }).first()) ?? null);
    } catch (err) {
        return Err(err);
    }
}

export async function requireInstallationKey(db: RegistryDb, { kid }: { kid: string }): Promise<Result<DBSelfHostingInstallationKey>> {
    return orMissing(await getInstallationKey(db, { kid }), `no live key ${kid}`);
}

export async function markInstallationKeyUsed(db: RegistryDb, { id, at }: { id: number; at: Date }): Promise<Result<void>> {
    try {
        await keys(db).where({ id }).update({ last_used_at: at });
        return Ok(undefined);
    } catch (err) {
        return Err(err);
    }
}
