import type knex from 'knex';
import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';
import type { CommitHash, Deployment } from '@nangohq/types';
import { FleetError } from '../utils/errors.js';

export const DEPLOYMENTS_TABLE = 'deployments';

interface DBDeployment {
    readonly id: number;
    readonly commit_id: CommitHash;
    readonly created_at: Date;
    readonly superseded_at: Date | null;
}

const DBDeployment = {
    to(dbDeployment: DBDeployment): Deployment {
        return {
            id: dbDeployment.id,
            commitId: dbDeployment.commit_id,
            createdAt: dbDeployment.created_at,
            supersededAt: dbDeployment.superseded_at
        };
    },
    from(deployment: Deployment): DBDeployment {
        return {
            id: deployment.id,
            commit_id: deployment.commitId,
            created_at: deployment.createdAt,
            superseded_at: deployment.supersededAt
        };
    }
};

export async function create(db: knex.Knex, commitId: CommitHash): Promise<Result<Deployment>> {
    try {
        return await db.transaction(async (trx) => {
            // do nothing if commitId is already active deployment
            const active = await getActive(db);
            if (active.isErr()) {
                return Err(active.error);
            }
            if (active.value?.commitId === commitId) {
                return Ok(active.value);
            }

            // supersede any active deployments
            const now = new Date();
            await trx
                .from<DBDeployment>(DEPLOYMENTS_TABLE)
                .where({
                    superseded_at: null
                })
                .update({ superseded_at: now });
            // insert new deployment
            const dbDeployment: Omit<DBDeployment, 'id'> = {
                commit_id: commitId,
                created_at: now,
                superseded_at: null
            };
            const [inserted] = await trx.into<DBDeployment>(DEPLOYMENTS_TABLE).insert(dbDeployment).returning('*');
            if (!inserted) {
                return Err(new Error(`Error: no deployment '${commitId}' created`));
            }
            return Ok(DBDeployment.to(inserted));
        });
    } catch (err) {
        return Err(new FleetError(`deployment_creation_failed`, { cause: err, context: { commitId } }));
    }
}

export async function getActive(db: knex.Knex): Promise<Result<Deployment | undefined>> {
    try {
        const active = await db.select<DBDeployment>('*').from(DEPLOYMENTS_TABLE).where({ superseded_at: null }).first();
        return Ok(active ? DBDeployment.to(active) : undefined);
    } catch (err) {
        return Err(new FleetError(`deployment_get_active_failed`, { cause: err }));
    }
}

export async function get(db: knex.Knex, id: number): Promise<Result<Deployment>> {
    try {
        const deployment = await db.select<DBDeployment>('*').from(DEPLOYMENTS_TABLE).where({ id }).first();
        if (!deployment) {
            return Err(new FleetError(`deployment_not_found`, { context: { id } }));
        }
        return Ok(DBDeployment.to(deployment));
    } catch (err) {
        return Err(new FleetError(`deployment_not_found`, { cause: err, context: { id } }));
    }
}
