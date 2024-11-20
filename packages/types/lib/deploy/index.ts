import type { ScriptTypeLiteral } from '../nangoYaml';
import type { LegacySyncModelSchema } from './incomingFlow';

export interface SyncDeploymentResult {
    name: string;
    version?: string;
    providerConfigKey: string;
    type: ScriptTypeLiteral;
    last_deployed?: Date;
    input?: string | LegacySyncModelSchema | undefined;
    models: string | string[];
    id?: number | undefined;

    /** @deprecated legacy **/
    sync_name?: string;
    /** @deprecated legacy **/
    syncName?: string;
}
