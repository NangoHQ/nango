import type knex from 'knex';
import type { Result } from '@nangohq/utils';
import { Ok, Err, stringifyError } from '@nangohq/utils';
import type { NodeState, Node, CommitHash, RoutingId } from '../types.js';

export const NODES_TABLE = 'nodes';

interface NodeStateTransition {
    from: NodeState;
    to: NodeState;
}

export const validNodeStateTransitions = [
    { from: 'PENDING', to: 'STARTING' },
    { from: 'STARTING', to: 'RUNNING' },
    { from: 'RUNNING', to: 'OUTDATED' },
    { from: 'OUTDATED', to: 'FINISHING' },
    { from: 'FINISHING', to: 'IDLE' },
    { from: 'IDLE', to: 'TERMINATED' }
] as const;
export type ValidNodeStateTransitions = (typeof validNodeStateTransitions)[number];
const NodeStateTransition = {
    validate({ from, to }: { from: NodeState; to: Omit<NodeState, 'ERROR'> }): Result<ValidNodeStateTransitions> {
        const transition = validNodeStateTransitions.find((t) => t.from === from && t.to === to);
        if (transition) {
            return Ok(transition);
        } else {
            return Err(new Error(`Invalid state transition from ${from} to ${to}`));
        }
    }
};

export interface DBNode {
    readonly id: number;
    readonly routing_id: RoutingId;
    readonly deployment_id: CommitHash;
    readonly url: string | null;
    readonly state: NodeState;
    readonly image: string;
    readonly cpu_milli: number;
    readonly memory_mb: number;
    readonly storage_mb: number;
    readonly error: string | null;
    readonly created_at: Date;
    readonly last_state_transition_at: Date;
}

export const DBNode = {
    to: (node: Node): DBNode => {
        return {
            id: node.id,
            routing_id: node.routingId,
            deployment_id: node.deploymentId,
            url: node.url,
            state: node.state,
            image: node.image,
            cpu_milli: node.cpuMilli,
            memory_mb: node.memoryMb,
            storage_mb: node.storageMb,
            error: node.error,
            created_at: node.createdAt,
            last_state_transition_at: node.lastStateTransitionAt
        };
    },
    from: (dbNode: DBNode): Node => {
        return {
            id: dbNode.id,
            routingId: dbNode.routing_id,
            deploymentId: dbNode.deployment_id,
            url: dbNode.url,
            state: dbNode.state,
            image: dbNode.image,
            cpuMilli: dbNode.cpu_milli,
            memoryMb: dbNode.memory_mb,
            storageMb: dbNode.storage_mb,
            error: dbNode.error,
            createdAt: dbNode.created_at,
            lastStateTransitionAt: dbNode.last_state_transition_at
        };
    }
};

export async function create(db: knex.Knex, nodeProps: Omit<Node, 'id' | 'createdAt' | 'state' | 'lastStateTransitionAt' | 'error'>): Promise<Result<Node>> {
    const now = new Date();
    const newNode: Omit<DBNode, 'id'> = {
        routing_id: nodeProps.routingId,
        deployment_id: nodeProps.deploymentId,
        url: nodeProps.url,
        state: 'PENDING',
        image: nodeProps.image,
        cpu_milli: nodeProps.cpuMilli,
        memory_mb: nodeProps.memoryMb,
        storage_mb: nodeProps.storageMb,
        error: null,
        created_at: now,
        last_state_transition_at: now
    };
    try {
        const inserted = await db.from<DBNode>(NODES_TABLE).insert(newNode).returning('*');
        if (!inserted?.[0]) {
            return Err(new Error(`Error: no node '${nodeProps.routingId}' created`));
        }
        return Ok(DBNode.from(inserted[0]));
    } catch (err: unknown) {
        return Err(new Error(`Error creating node '${nodeProps.routingId}': ${stringifyError(err)}`));
    }
}
export async function get(db: knex.Knex, nodeId: number, options: { forUpdate: boolean } = { forUpdate: false }): Promise<Result<Node>> {
    const query = db.select<DBNode>('*').from(NODES_TABLE).where({ id: nodeId }).first();
    if (options.forUpdate) {
        query.forUpdate();
    }
    const node = await query;
    if (!node) {
        return Err(new Error(`Node with id '${nodeId}' not found`));
    }
    return Ok(DBNode.from(node));
}

export async function search(
    db: knex.Knex,
    params: {
        states: [NodeState, ...NodeState[]]; // non-empty array
        routingId?: RoutingId;
        cursor?: number;
        limit?: number;
    }
): Promise<
    Result<{
        nodes: Map<RoutingId, Node[]>;
        nextCursor?: number;
    }>
> {
    const limit = params.limit || 1000;
    const query = db
        .select<DBNode[]>('*')
        .from(NODES_TABLE)
        .whereIn('state', params.states)
        .orderBy('id')
        .limit(limit + 1); // fetch one more than limit to determine if there are more results

    if (params.routingId) {
        query.where({ routing_id: params.routingId });
    }
    if (params.cursor) {
        query.where('id', '>=', params.cursor);
    }

    const nodes = await query;

    const nextCursor = nodes.length > limit ? nodes.pop()?.id : undefined;

    const nodesMap = new Map<RoutingId, Node[]>();

    for (const node of nodes) {
        const routingId = node.routing_id;
        const existingNodes = nodesMap.get(routingId) || [];
        existingNodes.push(DBNode.from(node));
        nodesMap.set(routingId, existingNodes);
    }

    return Ok({
        nodes: nodesMap,
        ...(nextCursor ? { nextCursor } : {})
    });
}

export async function transitionTo(
    db: knex.Knex,
    props: {
        nodeId: number;
        newState: Omit<NodeState, 'ERROR'>;
    }
): Promise<Result<Node>> {
    return db.transaction(async (trx) => {
        const node = await get(trx, props.nodeId, { forUpdate: true });
        if (node.isErr()) {
            return Err(new Error(`Node '${props.nodeId}' not found`));
        }

        const transition = NodeStateTransition.validate({ from: node.value.state, to: props.newState });
        if (transition.isErr()) {
            return Err(transition.error);
        }

        const updated = await trx
            .from<DBNode>(NODES_TABLE)
            .where('id', props.nodeId)
            .update({
                state: transition.value.to,
                last_state_transition_at: new Date()
            })
            .returning('*');
        if (!updated?.[0]) {
            return Err(new Error(`Node '${props.nodeId}' not updated`));
        }
        return Ok(DBNode.from(updated[0]));
    });
}

export async function fail(
    db: knex.Knex,
    props: {
        nodeId: number;
        error: string;
    }
): Promise<Result<Node>> {
    const updated = await db
        .from<DBNode>(NODES_TABLE)
        .where({ id: props.nodeId })
        .update({ state: 'ERROR', error: props.error, last_state_transition_at: new Date() })
        .returning('*');
    if (!updated?.[0]) {
        return Err(new Error(`Node '${props.nodeId}' not failed`));
    }
    return Ok(DBNode.from(updated[0]));
}
