import { nangoConfigFile } from '@nangohq/nango-yaml';

import { resolveLocalFileName, resolveLocalFilePath } from '../../utils/utils.js';

import type { NangoProps } from '@nangohq/types';

export type ScriptType = NangoProps['scriptType'];

export const scriptTypeToPath: Record<ScriptType, string> = {
    'on-event': 'on-events',
    action: 'actions',
    sync: 'syncs',
    webhook: 'syncs'
};

export interface DeploymentCoords {
    env: string;
    accountId: number;
    environmentId: number;
    configId: number;
    /** Only used for local path resolution (ignored by remote). */
    providerConfigKey: string;
}

export interface YamlCoords {
    env: string;
    accountId: number;
    environmentId: number;
}

export interface ScriptIdentity {
    scriptName: string;
    scriptType: ScriptType;
    version: string;
}

type RemoteCoords = Omit<DeploymentCoords, 'providerConfigKey'>;

/**
 * S3 keys for deployed files
 */
export const deployedPaths = {
    js: ({ env, accountId, environmentId, configId, scriptName, version }: RemoteCoords & Pick<ScriptIdentity, 'scriptName' | 'version'>): string =>
        `${env}/account/${accountId}/environment/${environmentId}/config/${configId}/${scriptName}-v${version}.js`,

    ts: ({ env, accountId, environmentId, configId, scriptName }: RemoteCoords & Pick<ScriptIdentity, 'scriptName'>): string =>
        `${env}/account/${accountId}/environment/${environmentId}/config/${configId}/${scriptName}.ts`,

    nangoYaml: ({ env, accountId, environmentId }: YamlCoords): string => `${env}/account/${accountId}/environment/${environmentId}/${nangoConfigFile}`,

    /** Derive the config-scoped directory from a JS file_location. */
    dirOf: (fileLocation: string): string => fileLocation.split('/').slice(0, -1).join('/'),

    /** Derive the environment-scoped root from a JS file_location (strips /config/{id}/{file}). */
    envRootOf: (fileLocation: string): string => fileLocation.split('/').slice(0, -3).join('/')
};

/**
 * Local filesystem paths for a customer's nango-integrations folder
 */
export const localPaths = {
    js: ({ scriptName, providerConfigKey }: { scriptName: string; providerConfigKey: string }): string =>
        resolveLocalFilePath({ fileName: resolveLocalFileName({ syncName: scriptName, providerConfigKey }) }),

    tsNested: ({ providerConfigKey, scriptType, scriptName }: { providerConfigKey: string; scriptType: ScriptType; scriptName: string }): string =>
        resolveLocalFilePath({ fileName: `${providerConfigKey}/${scriptTypeToPath[scriptType]}/${scriptName}.ts` }),

    tsFlat: ({ scriptName }: { scriptName: string }): string => resolveLocalFilePath({ fileName: `${scriptName}.ts` }),

    nangoYaml: (): string => resolveLocalFilePath({ fileName: nangoConfigFile }),

    // Relative filename used for local write operations
    tsNestedRelative: ({ providerConfigKey, scriptType, scriptName }: { providerConfigKey: string; scriptType: ScriptType; scriptName: string }): string =>
        `${providerConfigKey}/${scriptTypeToPath[scriptType]}/${scriptName}.ts`
};

/**
 * S3 keys for the public function catalog
 */
export const catalogPaths = {
    templateJs: ({ provider, scriptType, scriptName }: { provider: string; scriptType: ScriptType; scriptName: string }): string =>
        `templates-zero/${provider}/build/${provider}_${scriptTypeToPath[scriptType]}_${scriptName}.cjs`,

    templateTs: ({ provider, scriptType, scriptName }: { provider: string; scriptType: ScriptType; scriptName: string }): string =>
        `templates-zero/${provider}/${scriptTypeToPath[scriptType]}/${scriptName}.ts`
};
