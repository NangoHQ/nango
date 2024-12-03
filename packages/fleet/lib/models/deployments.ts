import type knex from 'knex';
import type { Result } from '@nangohq/utils';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import type { CommitHash, Deployment } from '../types.js';

export const DEPLOYMENTS_TABLE = 'deployments';

export interface DBDeployment {
    readonly commit_id: CommitHash;
    readonly created_at: Date;
    readonly superseded_at: Date | null;
}

const DBDeployment = {
    to(dbDeployment: DBDeployment): Deployment {
        return {
            commitId: dbDeployment.commit_id,
            createdAt: dbDeployment.created_at,
            supersededAt: dbDeployment.superseded_at
        };
    },
    from(deployment: Deployment): DBDeployment {
        return {
            commit_id: deployment.commitId,
            created_at: deployment.createdAt,
            superseded_at: deployment.supersededAt
        };
    }
};

export async function create(db: knex.Knex, commitId: CommitHash): Promise<Result<Deployment>> {
    try {
        return db.transaction(async (trx) => {
            const now = new Date();
            // supersede any active deployments
            await trx
                .from<DBDeployment>(DEPLOYMENTS_TABLE)
                .where({
                    superseded_at: null
                })
                .update({ superseded_at: now });
            // insert new deployment
            const dbDeployment: DBDeployment = {
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
    } catch (err: unknown) {
        return Err(new Error(`Error creating deployment '${commitId}': ${stringifyError(err)}`));
    }
}

export async function getActive(db: knex.Knex): Promise<Result<Deployment | undefined>> {
    try {
        const active = await db.select<DBDeployment>('*').from(DEPLOYMENTS_TABLE).where({ superseded_at: null }).first();
        return Ok(active ? DBDeployment.to(active) : undefined);
    } catch (err: unknown) {
        return Err(new Error(`Error getting active deployments: ${stringifyError(err)}`));
    }
}

export async function get(db: knex.Knex, commitId: CommitHash): Promise<Result<Deployment>> {
    try {
        const deployment = await db.select<DBDeployment>('*').from(DEPLOYMENTS_TABLE).where({ commit_id: commitId }).first();
        if (!deployment) {
            return Err(new Error(`Error: no deployment '${commitId}' found`));
        }
        return Ok(DBDeployment.to(deployment));
    } catch (err: unknown) {
        return Err(new Error(`Error getting deployment '${commitId}': ${stringifyError(err)}`));
    }
}
