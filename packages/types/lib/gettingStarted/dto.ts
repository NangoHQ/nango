import type { DBConnection } from '../connection/db.js';
import type { DBEnvironment } from '../environment/db.js';
import type { IntegrationConfig } from '../integration/db.js';

export interface GettingStartedOutput {
    meta: {
        environment: DBEnvironment;
        integration: IntegrationConfig;
    };
    connection: DBConnection | null;
    step: number;
}

export interface PatchGettingStartedInput {
    demo_connection_id?: string | undefined;
    step?: number | undefined;
    complete?: boolean | undefined;
}
