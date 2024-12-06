export type CommitHash = string & { readonly length: 40 };

export interface Deployment {
    readonly id: number;
    readonly commitId: CommitHash;
    readonly createdAt: Date;
    readonly supersededAt: Date | null;
}

export type RoutingId = string;

export const nodeStates = ['PENDING', 'STARTING', 'RUNNING', 'OUTDATED', 'FINISHING', 'IDLE', 'TERMINATED', 'ERROR'] as const;
export type NodeState = (typeof nodeStates)[number];

export interface Node {
    readonly id: number;
    readonly routingId: RoutingId;
    readonly deploymentId: number;
    readonly url: string | null;
    readonly state: NodeState;
    readonly image: string;
    readonly cpuMilli: number;
    readonly memoryMb: number;
    readonly storageMb: number;
    readonly error: string | null;
    readonly createdAt: Date;
    readonly lastStateTransitionAt: Date;
}
