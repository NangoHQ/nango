import type { Endpoint } from '../../api';
import type { IncomingScriptConfig, ScriptDifferences } from './payload';
import type { PostConnectionScriptByProvider } from '../post-connection/api';

export type DeployConfirmation = Endpoint<{
    Method: 'POST';
    Path: '/scripts/deploy/confirmation';
    Body: {
        flowConfigs: IncomingScriptConfig[];
        reconcile: boolean;
        debug: boolean;
        singleDeployMode?: boolean;
    };
    Success: ScriptDifferences;
}>;

export type DeployAction = Endpoint<{
    Method: 'POST';
    Path: '/scripts/deploy/action';
    Body: {
        flowConfigs: IncomingScriptConfig[];
        reconcile: boolean;
        debug: boolean;
        singleDeployMode?: boolean;
        postConnectionScriptsByProvider: PostConnectionScriptByProvider[];
    };
    Success: ScriptDifferences;
}>;
