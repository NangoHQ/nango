import type { FunctionDeploymentArtifact } from '../functions/api.js';

/** A Function in the integration catalog, without a deployed configuration. */
export type CatalogFunctionManifestEntry = Omit<FunctionDeploymentArtifact, 'integrationId' | 'fileBody' | 'source'> & {
    type: 'tool' | 'function';
    /** Optional catalog UUIDv8 override to preserve identity across public-name changes. */
    uuid?: string | undefined;
    /** Published artifact locations. */
    location: {
        js: string;
        ts: string;
    };
    /** Content hash of the definition and code. */
    version: string;
};
