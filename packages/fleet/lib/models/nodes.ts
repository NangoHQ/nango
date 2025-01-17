import type knex from 'knex';
import type { Result } from '@nangohq/utils';
import { Ok, Err } from '@nangohq/utils';
import type { NodeState, Node } from '../types.js';
import type { RoutingId } from '@nangohq/types';
import { FleetError } from '../utils/errors.js';

export const NODES_TABLE = 'nodes';

interface NodeStateTransition {
    from: NodeState;
    to: NodeState;
}

export const validNodeStateTransitions = [
    { from: 'PENDING', to: 'STARTING' },
    { from: 'PENDING', to: 'ERROR' },
    { from: 'STARTING', to: 'RUNNING' },
    { from: 'STARTING', to: 'ERROR' },
    { from: 'RUNNING', to: 'OUTDATED' },
    { from: 'RUNNING', to: 'ERROR' },
    { from: 'RUNNING', to: 'IDLE' },
    { from: 'OUTDATED', to: 'FINISHING' },
    { from: 'OUTDATED', to: 'ERROR' },
    { from: 'FINISHING', to: 'IDLE' },
    { from: 'FINISHING', to: 'ERROR' },
    { from: 'IDLE', to: 'TERMINATED' },
    { from: 'IDLE', to: 'ERROR' }
] as const;
type ValidNodeStateTransitions = (typeof validNodeStateTransitions)[number];
const NodeStateTransition = {
    validate({ from, to }: { from: NodeState; to: NodeState }): Result<ValidNodeStateTransitions> {
        const transition = validNodeStateTransitions.find((t) => t.from === from && t.to === to);
        if (transition) {
            return Ok(transition);
        } else {
            return Err(new FleetError(`node_invalid_state_transition`, { context: { from: from.toString(), to: to.toString() } }));
        }
    }
};

interface DBNode {
    readonly id: number;
    readonly routing_id: RoutingId;
    readonly deployment_id: number;
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

const DBNode = {
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

export async function create(
    db: knex.Knex,
    nodeProps: Omit<Node, 'id' | 'url' | 'createdAt' | 'state' | 'lastStateTransitionAt' | 'error'>
): Promise<Result<Node>> {
    const now = new Date();
    const newNode: Omit<DBNode, 'id' | 'url'> = {
        routing_id: nodeProps.routingId,
        deployment_id: nodeProps.deploymentId,
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
            return Err(new FleetError(`node_creation_failed`, { context: nodeProps }));
        }
        return Ok(DBNode.from(inserted[0]));
    } catch (err) {
        return Err(new FleetError(`node_creation_failed`, { cause: err, context: nodeProps }));
    }
}
export async function get(db: knex.Knex, nodeId: number, options: { forUpdate: boolean } = { forUpdate: false }): Promise<Result<Node>> {
    try {
        const query = db.select<DBNode>('*').from(NODES_TABLE).where({ id: nodeId }).first();
        if (options.forUpdate) {
            query.forUpdate();
        }
        const node = await query;
        if (!node) {
            return Err(new FleetError(`node_not_found`, { context: { nodeId } }));
        }
        return Ok(DBNode.from(node));
    } catch (err) {
        return Err(new FleetError(`node_not_found`, { cause: err, context: { nodeId } }));
    }
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
        nodes: Map<RoutingId, Record<NodeState, Node[]>>;
        nextCursor?: number;
    }>
> {
    try {
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

        const nodesMap = new Map<RoutingId, Record<NodeState, Node[]>>();

        for (const node of nodes) {
            const routingId = node.routing_id;
            const existingNodes = nodesMap.get(routingId) || ({} as Record<NodeState, Node[]>);
            nodesMap.set(routingId, {
                ...existingNodes,
                [node.state]: [...(existingNodes[node.state] || []), DBNode.from(node)]
            });
        }

        return Ok({
            nodes: nodesMap,
            ...(nextCursor ? { nextCursor } : {})
        });
    } catch (err) {
        return Err(new FleetError(`node_search_failed`, { cause: err, context: params }));
    }
}

export async function transitionTo(
    db: knex.Knex,
    props:
        | {
              nodeId: number;
              newState: Exclude<NodeState, 'ERROR' | 'RUNNING'>;
          }
        | {
              nodeId: number;
              newState: 'ERROR';
              reason: string;
          }
        | {
              nodeId: number;
              newState: 'RUNNING';
              url: string;
          }
): Promise<Result<Node>> {
    try {
        return await db.transaction(async (trx) => {
            const getNode = await get(trx, props.nodeId, { forUpdate: true });
            if (getNode.isErr()) {
                return getNode;
            }

            const transition = NodeStateTransition.validate({ from: getNode.value.state, to: props.newState });
            if (transition.isErr()) {
                return Err(transition.error);
            }

            let newFields: {
                state: NodeState;
                last_state_transition_at: Date;
                url?: string;
                error?: string;
            } = {
                state: transition.value.to,
                last_state_transition_at: new Date()
            };
            if ('url' in props) {
                newFields = {
                    ...newFields,
                    url: props.url
                };
            } else if ('reason' in props) {
                newFields = {
                    ...newFields,
                    error: props.reason
                };
            }
            const updated = await trx.from<DBNode>(NODES_TABLE).where('id', props.nodeId).update(newFields).returning('*');

            if (!updated?.[0]) {
                return Err(new FleetError(`node_transition_failed`, { context: { nodeId: props.nodeId, newState: props.newState.toString() } }));
            }
            return Ok(DBNode.from(updated[0]));
        });
    } catch (err) {
        return Err(new FleetError(`node_transition_failed`, { cause: err, context: { nodeId: props.nodeId, newState: props.newState.toString() } }));
    }
}

export async function fail(
    db: knex.Knex,
    props: {
        nodeId: number;
        reason: string;
    }
): Promise<Result<Node>> {
    return transitionTo(db, { nodeId: props.nodeId, newState: 'ERROR', reason: props.reason });
}

export async function register(
    db: knex.Knex,
    props: {
        nodeId: number;
        url: string;
    }
): Promise<Result<Node>> {
    return transitionTo(db, { nodeId: props.nodeId, newState: 'RUNNING', url: props.url });
}

export async function idle(
    db: knex.Knex,
    props: {
        nodeId: number;
    }
): Promise<Result<Node>> {
    return transitionTo(db, { nodeId: props.nodeId, newState: 'IDLE' });
}

export async function terminate(
    db: knex.Knex,
    props: {
        nodeId: number;
    }
): Promise<Result<Node>> {
    return transitionTo(db, { nodeId: props.nodeId, newState: 'TERMINATED' });
}

export async function remove(
    db: knex.Knex,
    props: {
        nodeId: number;
    }
): Promise<Result<Node>> {
    try {
        // only TERMINATED and ERROR nodes can be deleted
        const getNode = await get(db, props.nodeId);
        if (getNode.isErr()) {
            return getNode;
        }
        if (!['TERMINATED', 'ERROR'].includes(getNode.value.state)) {
            return Err(new FleetError(`node_delete_non_terminated`, { context: { nodeId: props.nodeId } }));
        }

        const deleted = await db.from<DBNode>(NODES_TABLE).where('id', props.nodeId).del().returning('*');
        if (!deleted?.[0]) {
            return Err(new FleetError(`node_delete_failed`, { context: props }));
        }
        return Ok(DBNode.from(deleted[0]));
    } catch (err) {
        return Err(new FleetError(`node_delete_failed`, { cause: err, context: props }));
    }
}
