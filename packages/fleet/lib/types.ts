import type { NodeConfig, RoutingId } from '@nangohq/types';

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
    readonly isTracingEnabled: NodeConfig['isTracingEnabled'];
    readonly isProfilingEnabled: NodeConfig['isProfilingEnabled'];
    readonly idleTimeoutSecs: number | null;
    readonly error: string | null;
    readonly createdAt: Date;
    readonly lastStateTransitionAt: Date;
}

export interface NodeConfigOverride {
    readonly id: number;
    readonly routingId: Node['routingId'];
    readonly image: NodeConfig['image'] | null;
    readonly cpuMilli: NodeConfig['cpuMilli'] | null;
    readonly memoryMb: NodeConfig['memoryMb'] | null;
    readonly storageMb: NodeConfig['storageMb'] | null;
    readonly isTracingEnabled: NodeConfig['isTracingEnabled'] | null;
    readonly isProfilingEnabled: NodeConfig['isProfilingEnabled'] | null;
    readonly idleTimeoutSecs: number | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
