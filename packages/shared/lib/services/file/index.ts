import { isEnterprise, isLocal, isTest, useS3 } from '@nangohq/utils';

import localFileService from './local.service.js';
import remoteFileService from './remote.service.js';

import type { DeploymentCoords, ScriptIdentity, YamlCoords } from './paths.js';
import type { DBSyncConfig } from '@nangohq/types';
import type { Response } from 'express';

export type { DeploymentCoords, ScriptIdentity, YamlCoords } from './paths.js';

/**
 * Functions (aka. flows, syncs) file service interface.
 */
export interface FileService {
    // Reads
    getCompiledJs(args: { syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<string | null>;
    getSourceTs(args: { syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<string | null>;
    zipAndSendFlow(args: { res: Response; syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<void>;

    // Writes (deploy pipeline). Returns an opaque handle stored as `file_location`.
    uploadCompiledJs(args: { content: string; coords: DeploymentCoords; script: ScriptIdentity }): Promise<string | null>;
    uploadSourceTs(args: { content: string; coords: DeploymentCoords; script: Pick<ScriptIdentity, 'scriptName' | 'scriptType'> }): Promise<string | null>;
    uploadNangoYaml(args: { content: string; coords: YamlCoords }): Promise<string | null>;

    // Deletes
    deleteDeployedFiles(fileLocations: string[]): Promise<void>;
}

const useLocalFiles = isEnterprise ? !useS3 : isLocal || isTest;

export const fileService: FileService = useLocalFiles ? localFileService : remoteFileService;
