import type { RoutingId, NodeConfig } from '@nangohq/types';

export const nodeStates = ['PENDING', 'STARTING', 'RUNNING', 'OUTDATED', 'FINISHING', 'IDLE', 'TERMINATED', 'ERROR'] as const;
export type NodeState = (typeof nodeStates)[number];

export interface Node {
    readonly id: number;
    readonly routingId: RoutingId;
    readonly deploymentId: number;
    readonly url: string | null;
    readonly state: NodeState;
    readonly image: NodeConfig['image'];
    readonly cpuMilli: NodeConfig['cpuMilli'];
    readonly memoryMb: NodeConfig['memoryMb'];
    readonly storageMb: NodeConfig['storageMb'];
    readonly error: string | null;
    readonly createdAt: Date;
    readonly lastStateTransitionAt: Date;
}
