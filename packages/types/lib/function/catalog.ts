import type { FunctionDeploymentArtifact } from '../functions/api.js';

/** A native function published in the integration catalog, without a deployed configuration. */
export type CatalogFunctionManifestEntry = Omit<FunctionDeploymentArtifact, 'integrationId' | 'fileBody' | 'source'> & {
    module: 'function';
    /** Content hash of the definition and code, comparable with a deployed native function's version. */
    version: string;
    sdkVersion: string;
    /** Compiled artifact path relative to the provider's canonical templates-zero folder. */
    fileLocation: string;
    /** Source artifact path relative to the provider's canonical templates-zero folder, independent of the public name. */
    sourceLocation: string;
};
