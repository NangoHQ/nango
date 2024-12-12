import type knex from 'knex';
import type { Result } from '@nangohq/utils';
import { Ok, Err } from '@nangohq/utils';
import { FleetError } from '../utils/errors.js';
import type { NodeConfigOverride } from '../types.js';
import type { RoutingId } from '@nangohq/types';

export const NODE_CONFIG_OVERRIDES_TABLE = 'node_config_overrides';

interface DBNodeConfigOverride {
    readonly id: number;
    readonly routing_id: RoutingId;
    readonly image: string;
    readonly cpu_milli: number;
    readonly memory_mb: number;
    readonly storage_mb: number;
    readonly created_at: Date;
    readonly updated_at: Date;
}

const DBNodeConfigOverride = {
    to: (nodeConfigOverride: NodeConfigOverride): DBNodeConfigOverride => {
        return {
            id: nodeConfigOverride.id,
            routing_id: nodeConfigOverride.routingId,
            image: nodeConfigOverride.image,
            cpu_milli: nodeConfigOverride.cpuMilli,
            memory_mb: nodeConfigOverride.memoryMb,
            storage_mb: nodeConfigOverride.storageMb,
            created_at: nodeConfigOverride.createdAt,
            updated_at: nodeConfigOverride.updatedAt
        };
    },
    from: (dbNodeConfigOverride: DBNodeConfigOverride): NodeConfigOverride => {
        return {
            id: dbNodeConfigOverride.id,
            routingId: dbNodeConfigOverride.routing_id,
            image: dbNodeConfigOverride.image,
            cpuMilli: dbNodeConfigOverride.cpu_milli,
            memoryMb: dbNodeConfigOverride.memory_mb,
            storageMb: dbNodeConfigOverride.storage_mb,
            createdAt: dbNodeConfigOverride.created_at,
            updatedAt: dbNodeConfigOverride.updated_at
        };
    }
};

export async function create(
    db: knex.Knex,
    props: Omit<NodeConfigOverride, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Result<NodeConfigOverride, FleetError>> {
    try {
        const now = new Date();
        const newNodeConfigOverride: Omit<DBNodeConfigOverride, 'id'> = {
            routing_id: props.routingId,
            image: props.image,
            cpu_milli: props.cpuMilli,
            memory_mb: props.memoryMb,
            storage_mb: props.storageMb,
            created_at: now,
            updated_at: now
        };
        const [created] = await db.from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE).insert(newNodeConfigOverride).returning('*');
        if (!created) {
            return Err(new FleetError(`node_config_override_creation_failed`, { context: props }));
        }
        return Ok(DBNodeConfigOverride.from(created));
    } catch (err) {
        return Err(new FleetError('node_config_override_creation_failed', { cause: err, context: props }));
    }
}

export async function update(
    db: knex.Knex,
    props: Partial<NodeConfigOverride> & Required<Pick<NodeConfigOverride, 'routingId'>>
): Promise<Result<NodeConfigOverride, FleetError>> {
    try {
        const now = new Date();
        const toUpdate: Partial<DBNodeConfigOverride> = {
            ...(props.image ? { image: props.image } : {}),
            ...(props.cpuMilli ? { cpu_milli: props.cpuMilli } : {}),
            ...(props.memoryMb ? { memory_mb: props.memoryMb } : {}),
            ...(props.storageMb ? { storage_mb: props.storageMb } : {}),
            updated_at: now
        };
        const [updated] = await db
            .from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE)
            .update(toUpdate)
            .where({ routing_id: props.routingId })
            .returning('*');
        if (!updated) {
            return Err(new FleetError('node_config_override_update_failed', { context: props }));
        }
        return Ok(DBNodeConfigOverride.from(updated));
    } catch (err) {
        return Err(new FleetError('node_config_override_update_failed', { cause: err, context: props }));
    }
}

export async function remove(db: knex.Knex, routingId: RoutingId): Promise<Result<NodeConfigOverride, FleetError>> {
    try {
        const [deleted] = await db.from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE).delete().where({ routing_id: routingId }).returning('*');
        if (!deleted) {
            return Err(new FleetError('node_config_override_not_found', { context: { routingId } }));
        }
        return Ok(DBNodeConfigOverride.from(deleted));
    } catch (err) {
        return Err(new FleetError('node_config_override_delete_failed', { cause: err, context: { routingId } }));
    }
}

export async function search(
    db: knex.Knex,
    params: {
        routingIds?: RoutingId[];
    }
): Promise<Result<Map<RoutingId, NodeConfigOverride>, FleetError>> {
    try {
        const query = db.from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE).select('*');
        if (params.routingIds) {
            query.whereIn('routing_id', params.routingIds);
        }
        const nodeConfigOverrides = await query;
        const nodeConfigOverridesMap = new Map<RoutingId, NodeConfigOverride>();
        for (const nodeConfigOverride of nodeConfigOverrides) {
            nodeConfigOverridesMap.set(nodeConfigOverride.routing_id, DBNodeConfigOverride.from(nodeConfigOverride));
        }
        return Ok(nodeConfigOverridesMap);
    } catch (err) {
        return Err(new FleetError('node_config_override_search_failed', { cause: err, context: { params } }));
    }
}

export async function resetImage(db: knex.Knex, props: Pick<NodeConfigOverride, 'image'>): Promise<Result<NodeConfigOverride[], FleetError>> {
    try {
        const toUpdate: Partial<DBNodeConfigOverride> = {
            image: props.image
        };
        const updated = await db.from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE).update(toUpdate).returning('*');
        if (!updated) {
            return Err(new FleetError('node_config_override_reset_image_failed', { context: props }));
        }
        return Ok(updated.map(DBNodeConfigOverride.from));
    } catch (err) {
        return Err(new FleetError('node_config_override_reset_image_failed', { cause: err, context: props }));
    }
}
