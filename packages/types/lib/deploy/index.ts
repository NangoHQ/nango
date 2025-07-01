import type { LegacySyncModelSchema } from './incomingFlow.js';
import type { ScriptTypeLiteral } from '../nangoYaml/index.js';

// TODO split by type
// and fix id being optional
export interface SyncDeploymentResult {
    name: string;
    version?: string;
    providerConfigKey: string;
    type: ScriptTypeLiteral;
    last_deployed?: Date;
    input?: string | LegacySyncModelSchema | undefined | null;
    models: string | string[];
    id?: number | undefined;
    runs?: string | null;

    /** @deprecated legacy **/
    sync_name?: string;
    /** @deprecated legacy **/
    syncName?: string;
}
