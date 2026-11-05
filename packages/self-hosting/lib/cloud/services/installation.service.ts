import { Err, Ok } from '@nangohq/utils';

import { INSTALLATIONS_TABLE } from '../db/schema.js';
import { inserted, table } from './db.js';

import type { RegistryDb } from './db.js';
import type { DBSelfHostingInstallation } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const installations = (db: RegistryDb) => table<DBSelfHostingInstallation>(db, INSTALLATIONS_TABLE);

export async function createInstallation(
    db: RegistryDb,
    {
        customerId,
        name,
        mode,
        stage,
        telemetry,
        alerts
    }: {
        customerId: number;
        name: string;
        mode: DBSelfHostingInstallation['mode'];
        stage: DBSelfHostingInstallation['stage'];
        telemetry?: boolean;
        alerts?: DBSelfHostingInstallation['alerts'];
    }
): Promise<Result<DBSelfHostingInstallation>> {
    try {
        const row = await installations(db)
            .insert({ customer_id: customerId, name, mode, stage, ...(telemetry !== undefined && { telemetry }), ...(alerts && { alerts }) })
            .returning('*');
        return Ok(inserted(row));
    } catch (err) {
        return Err(err);
    }
}

export async function getInstallationByUuid(db: RegistryDb, { uuid }: { uuid: string }): Promise<Result<DBSelfHostingInstallation | null>> {
    try {
        return Ok((await installations(db).where({ uuid, deleted_at: null }).first()) ?? null);
    } catch (err) {
        return Err(err);
    }
}
