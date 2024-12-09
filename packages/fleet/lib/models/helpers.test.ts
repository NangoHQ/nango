import type { NodeState, Node } from '../types.js';
import type { RoutingId } from '@nangohq/types';
import type { knex } from 'knex';
import { nanoid } from '@nangohq/utils';
import * as nodes from './nodes.js';

export async function createNodeWithAttributes(
    db: knex.Knex,
    {
        state,
        deploymentId,
        routingId = nanoid(),
        lastStateTransitionAt
    }: { state: NodeState; deploymentId: number; routingId?: RoutingId; lastStateTransitionAt?: Date }
): Promise<Node> {
    return db.transaction(async (trx) => {
        let node = await createNode(trx, { routingId, deploymentId });
        if (state == 'ERROR') {
            node = (await nodes.fail(trx, { nodeId: node.id, reason: 'my error' })).unwrap();
        }
        // transition to the desired state
        while (node.state !== state) {
            const nextState = nodes.validNodeStateTransitions.find((v) => v.from === node.state && v.to !== 'ERROR')?.to;
            if (nextState === 'RUNNING') {
                node = (await nodes.register(trx, { nodeId: node.id, url: 'http://my-url' })).unwrap();
            } else if (nextState && nextState !== 'ERROR') {
                node = (await nodes.transitionTo(trx, { nodeId: node.id, newState: nextState })).unwrap();
            } else {
                throw new Error(`Cannot transition node to state '${state}'`);
            }
        }
        if (lastStateTransitionAt) {
            await trx
                .from(nodes.NODES_TABLE)
                .update({ created_at: lastStateTransitionAt, last_state_transition_at: lastStateTransitionAt })
                .where('id', node.id);
            node = {
                ...node,
                createdAt: lastStateTransitionAt,
                lastStateTransitionAt
            };
        }
        return node;
    });
}

async function createNode(db: knex.Knex, { routingId, deploymentId }: { routingId: RoutingId; deploymentId: number }): Promise<Node> {
    const node = await nodes.create(db, {
        routingId,
        deploymentId,
        image: 'nangohq/my-image:latest',
        cpuMilli: 500,
        memoryMb: 1024,
        storageMb: 512
    });
    return node.unwrap();
}
