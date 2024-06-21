import type { Endpoint } from '../api.js';
import type { IncomingFlowConfig, PostConnectionScriptByProvider } from './incomingFlow.js';

export type PostDeployConfirmation = Endpoint<{
    Method: 'POST';
    Path: '/sync/deploy/confirmation';
    Body: {
        flowConfigs: IncomingFlowConfig[];
        postConnectionScriptsByProvider: PostConnectionScriptByProvider[];
        reconcile: boolean;
        debug: boolean;
        singleDeployMode?: boolean;
    };
    Success: SyncAndActionDifferences;
}>;

export type PostDeploy = Endpoint<{
    Method: 'POST';
    Path: '/sync/deploy';
    Body: {
        flowConfigs: IncomingFlowConfig[];
        postConnectionScriptsByProvider: PostConnectionScriptByProvider[];
        nangoYamlBody: string;
        reconcile: boolean;
        debug: boolean;
        singleDeployMode?: boolean;
    };
    Success: any[]; // TODO: move SyncDeploymentResult here
}>;

export interface SlimSync {
    id?: number; // Can be new
    name: string;
    auto_start: boolean;
    sync_id?: string | null;
    providerConfigKey: string;
    connections?: number;
    enabled?: boolean;
}

export interface SlimAction {
    id?: number; // Can be new
    providerConfigKey: string;
    name: string;
}

export interface SyncAndActionDifferences {
    newSyncs: SlimSync[];
    deletedSyncs: SlimSync[];
    newActions: SlimAction[];
    deletedActions: SlimAction[];
}
