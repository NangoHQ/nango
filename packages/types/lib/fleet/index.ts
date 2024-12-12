export type CommitHash = string & { readonly length: 40 };

export interface Deployment {
    readonly id: number;
    readonly commitId: CommitHash;
    readonly createdAt: Date;
    readonly supersededAt: Date | null;
}

export type RoutingId = string;

export interface NodeConfig {
    readonly image: string;
    readonly cpuMilli: number;
    readonly memoryMb: number;
    readonly storageMb: number;
}
