import type { JSONSchema7 } from 'json-schema';

import type { Endpoint, ApiError } from '../api.js';
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
        jsonSchema?: JSONSchema7 | undefined;
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
        jsonSchema?: JSONSchema7 | undefined;
    };
    Success: any[]; // TODO: move SyncDeploymentResult here
}>;

export type PostDeployInternal = Endpoint<{
    Method: 'POST';
    Path: '/sync/deploy/internal';
    Querystring: {
        customEnvironment: string;
    };
    Body: {
        flowConfigs: IncomingFlowConfig[];
        postConnectionScriptsByProvider: PostConnectionScriptByProvider[];
        nangoYamlBody: string;
        reconcile: boolean;
        debug: boolean;
        singleDeployMode?: boolean;
        jsonSchema?: JSONSchema7 | undefined;
    };
    Error: ApiError<'forbidden'> | ApiError<'environment_creation_error'>;
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
    deletedModels: string[];
}
