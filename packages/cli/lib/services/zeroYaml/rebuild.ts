import fs from 'node:fs';
import path from 'node:path';
import type {
    NangoYamlParsed,
    NangoYamlParsedIntegration,
    NangoModelField,
    CreateSyncResponse,
    CreateActionResponse,
    CreateOnEventResponse
} from '@nangohq/types';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type { ZodTypeAny } from 'zod';
import { zodToNangoModelField } from '../../utils/zodToNango.js';

async function readdirRecursive(dir: string): Promise<string[]> {
    let files: string[] = [];
    const folder = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const file of folder) {
        if (file.isDirectory()) {
            const nestedFiles = await readdirRecursive(path.join(file.path, file.name));
            files = files.concat(nestedFiles);
        } else if (file.isFile() && file.name.endsWith('.cjs')) {
            files.push(path.join(file.path, file.name));
        }
    }

    return files;
}

export async function rebuildParsed({ fullPath }: { fullPath: string; debug?: boolean }): Promise<NangoYamlParsed> {
    const parsed: NangoYamlParsed = { yamlVersion: 'v2', integrations: [], models: new Map() };

    const dist = path.join(fullPath, 'dist');
    const files = await readdirRecursive(dist);

    console.log('Found', files.length, 'scripts');

    for (const file of files) {
        const basename = path.basename(file, '.cjs');
        const basenameClean = basename.replaceAll(/[^a-zA-Z]/g, '');
        const filePath = file;

        const importedModule = await import(filePath);
        const obj:
            | CreateSyncResponse<Record<string, Zod.ZodObject<any>>, Zod.ZodObject<any>>
            | CreateActionResponse<ZodTypeAny, ZodTypeAny>
            | CreateOnEventResponse = importedModule.default.default;

        let integration: NangoYamlParsedIntegration | undefined = parsed.integrations.find((v) => v.providerConfigKey === obj.params.integrationId);
        if (!integration) {
            integration = {
                providerConfigKey: obj.params.integrationId,
                actions: [],
                syncs: [],
                onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [] }
            };
            parsed.integrations.push(integration);
        }

        const integrationId = obj.params.integrationId;

        if (obj.type === 'sync') {
            const params = obj.params;

            const usedModels: string[] = [...Object.keys(params.models)];
            const metadata = params.metadata ? zodToNangoModelField(`SyncMetadata_${integrationId}_${basenameClean}`, params.metadata) : null;
            if (metadata) {
                usedModels.push(metadata.name);
                parsed.models.set(metadata.name, { name: metadata.name, fields: metadata.value as NangoModelField[] });
            }

            integration.syncs.push({
                type: 'sync',
                description: params.description,
                auto_start: params.autoStart === true,
                endpoints: params.endpoints,
                input: metadata?.name || null,
                name: basename,
                output: Object.entries(params.models).map(([name, model]) => {
                    const to = zodToNangoModelField(name, model);
                    parsed.models.set(name, { name, fields: to['value'] as NangoModelField[] });
                    usedModels.push(name);
                    return name;
                }),
                runs: params.runs,
                scopes: params.scopes || [],
                sync_type: params.syncType,
                track_deletes: params.trackDeletes === true,
                usedModels,
                version: params.version || '0.0.1',
                webhookSubscriptions: params.webhookSubscriptions || []
            });
        } else if (obj.type === 'action') {
            const params = obj.params;

            const input = zodToNangoModelField(`ActionInput_${integrationId}_${basenameClean}`, params.input);
            parsed.models.set(input.name, { name: input.name, fields: input.value as NangoModelField[] });

            const output = zodToNangoModelField(`ActionOutput_${integrationId}_${basenameClean}`, params.output);
            parsed.models.set(output.name, { name: output.name, fields: input.value as NangoModelField[] });
            integration.actions.push({
                type: 'action',
                description: params.description,
                endpoint: params.endpoint,
                input: input.name,
                name: basename,
                output: [output.name],
                scopes: params.scopes || [],
                usedModels: [input.name, output.name],
                version: params.version || '0.0.1'
            });
        } else if (obj.type === 'on-event') {
            if (obj.params.event === 'post-connection-creation') {
                integration.onEventScripts['post-connection-creation'].push(basename);
            } else if (obj.params.event === 'pre-connection-deletion') {
                integration.onEventScripts['pre-connection-deletion'].push(basename);
            }
        }
    }

    return parsed;
}
