import type {
    HTTP_VERB,
    NangoModel,
    NangoModelField,
    NangoSyncEndpoint,
    NangoYamlParsedIntegration,
    NangoYamlV2,
    NangoYamlV2Integration,
    ParsedNangoAction,
    ParsedNangoSync
} from '@nangohq/types';
import { NangoYamlParser } from './parser.js';
import {
    ParserErrorDuplicateEndpoint,
    ParserErrorDuplicateModel,
    ParserErrorEndpointsMismatch,
    ParserErrorInvalidRuns,
    ParserErrorMissingId,
    ParserErrorModelNotFound
} from './errors.js';
import { getInterval, isJsOrTsType } from './helpers.js';

export class NangoYamlParserV2 extends NangoYamlParser {
    parse(): boolean {
        const yaml = this.raw as unknown as NangoYamlV2;
        const output: NangoYamlParsedIntegration[] = [];
        this.modelsParser.parseAll();

        if (this.modelsParser.errors.length > 0) {
            this.errors.push(...this.modelsParser.errors);
            return false;
        }

        for (const providerConfigKey in yaml.integrations) {
            const integration = yaml.integrations[providerConfigKey];
            if (!integration) {
                continue;
            }

            // check that models are used only once per integration
            const usedModels = new Set<string>();

            const syncs = integration['syncs'];
            const actions = integration['actions'];
            const postConnectionScripts: string[] = integration['post-connection-scripts'] || [];

            const parsedSyncs = this.parseSyncs({ syncs, usedModels });
            const parseActions = this.parseActions({ actions, usedModels });

            const parsedIntegration: NangoYamlParsedIntegration = {
                providerConfigKey,
                syncs: parsedSyncs,
                actions: parseActions,
                postConnectionScripts
            };

            output.push(parsedIntegration);
        }

        this.parsed = {
            yamlVersion: 'v2',
            integrations: output,
            models: this.modelsParser.parsed
        };
        return this.errors.length <= 0;
    }

    parseSyncs({ syncs, usedModels }: { syncs: NangoYamlV2Integration['syncs']; usedModels: Set<string> }): ParsedNangoSync[] {
        const parsedSyncs: ParsedNangoSync[] = [];

        for (const syncName in syncs) {
            const sync = syncs[syncName];
            if (!sync) {
                continue;
            }

            const modelOutput = this.getModelForOutput({ rawOutput: sync.output, usedModels, name: syncName, type: 'sync' });
            if (!modelOutput) {
                continue;
            }

            const modelInput = this.getModelForInput({ usedModels, rawInput: sync.input, name: syncName, type: 'sync' });

            const endpoints: NangoSyncEndpoint[] = [];
            if (sync.endpoint) {
                const tmp = Array.isArray(sync.endpoint) ? sync.endpoint : [sync.endpoint];

                if (tmp.length !== modelOutput.length) {
                    this.errors.push(new ParserErrorEndpointsMismatch({ syncName: syncName, path: `syncs > ${syncName}` }));
                    continue;
                }

                let failed = false;
                for (const endpoint of tmp) {
                    const split = endpoint.split(' ') as [HTTP_VERB, string];

                    if (this.endpoints.has(endpoint)) {
                        this.errors.push(new ParserErrorDuplicateEndpoint({ endpoint: endpoint, path: `syncs > ${syncName}` }));
                        failed = true;
                        break;
                    }

                    this.endpoints.add(endpoint);
                    endpoints.push({ [split[0]]: split[1] });
                }
                if (failed) {
                    // a bit hacky sorry
                    continue;
                }
            }

            const interval = getInterval(sync.runs, new Date());
            if (interval instanceof Error) {
                this.errors.push(new ParserErrorInvalidRuns({ message: interval.message, path: `syncs > ${syncName}` }));
                continue;
            }

            let webhookSubscriptions: string[] = [];
            if (sync['webhook-subscriptions']) {
                if (Array.isArray(sync['webhook-subscriptions'])) {
                    webhookSubscriptions = sync['webhook-subscriptions'];
                } else {
                    webhookSubscriptions = [sync['webhook-subscriptions']];
                }
            }

            const parsedSync: ParsedNangoSync = {
                name: syncName,
                type: 'sync',
                description: sync.description || '',
                sync_type: sync.sync_type === 'incremental' ? 'incremental' : 'full',
                models: [],
                runs: sync.runs,
                track_deletes: sync.track_deletes || false,
                auto_start: sync.auto_start === false ? false : true,
                input: modelInput,
                scopes: Array.isArray(sync.scopes) ? sync.scopes : sync.scopes ? sync.scopes?.split(',') : [],
                endpoints,
                nango_yaml_version: 'v2',
                webhookSubscriptions,
                layout_mode: 'root'
                // TODO
                // layout_mode: localFileService.getLayoutMode(syncName, providerConfigKey, 'sync')
            };

            parsedSyncs.push(parsedSync);
        }

        return parsedSyncs;
    }

    parseActions({ actions, usedModels }: { actions: NangoYamlV2Integration['actions']; usedModels: Set<string> }): ParsedNangoAction[] {
        const parsedActions: ParsedNangoAction[] = [];

        for (const actionName in actions) {
            const action = actions[actionName];
            if (!action) {
                continue;
            }

            const modelOutput = this.getModelForOutput({ rawOutput: action.output, usedModels, name: actionName, type: 'action' });
            if (!modelOutput) {
                continue;
            }

            const modelInput = this.getModelForInput({ usedModels, rawInput: action.input, name: actionName, type: 'action' });

            const endpoint: NangoSyncEndpoint = {};
            if (action.endpoint) {
                const split = action.endpoint.split(' ') as [HTTP_VERB, string];

                if (this.endpoints.has(action.endpoint)) {
                    this.errors.push(new ParserErrorDuplicateEndpoint({ endpoint: action.endpoint, path: `actions > ${actionName}` }));
                    continue;
                }

                this.endpoints.add(action.endpoint);
                endpoint[split[0]] = split[1];
            }

            const parsedAction: ParsedNangoAction = {
                name: actionName,
                type: 'action',
                description: action.description || '',
                models: [],
                scopes: Array.isArray(action.scopes) ? action.scopes : String(action.scopes)?.split(','),
                input: modelInput,
                endpoint,
                nango_yaml_version: 'v2'
            };

            parsedActions.push(parsedAction);
        }

        return parsedActions;
    }

    getModelForOutput({
        rawOutput,
        usedModels,
        name,
        type
    }: {
        rawOutput: string | string[] | undefined;
        usedModels: Set<string>;
        name: string;
        type: 'sync' | 'action';
    }): NangoModel[] | null {
        if (!rawOutput) {
            return null;
        }

        const models: NangoModel[] = [];

        const output = Array.isArray(rawOutput) ? rawOutput : [rawOutput];
        for (const modelOrType of output) {
            if (isJsOrTsType(modelOrType)) {
                continue;
            }

            if (type === 'sync' && usedModels.has(modelOrType)) {
                this.errors.push(new ParserErrorDuplicateModel({ model: modelOrType, path: `${type} > ${name}` }));
                continue;
            }

            const model = this.modelsParser.get(modelOrType);
            if (!model) {
                this.errors.push(new ParserErrorModelNotFound({ model: modelOrType, path: `${type} > ${name}` }));
                continue;
            }

            usedModels.add(modelOrType);

            if (type === 'sync' && !model.fields.find((field) => field.name === 'id')) {
                this.errors.push(new ParserErrorMissingId({ model: modelOrType, path: `${type} > ${name}` }));
                continue;
            }

            models.push(model);
            // const subModels = modelFields.response.filter((field) => {
            //     if (typeof field?.type === 'string') {
            //         const cleanType = field.type.replace(/\[\]/g, '');
            //         return allModelNames.has(cleanType);
            //     } else {
            //         return false;
            //     }
            // });

            // for (const subModel of subModels) {
            //     const subModelFields = getFieldsForModel(subModel.type, config);
            //     if (!subModelFields.response) {
            //         return { success: false, error: subModelFields.error, response: null };
            //     }

            //     const subModelName = subModel.type.replace(/\[\]/g, '');
            //     models.push({ name: subModelName, fields: subModelFields.response });
            // }
        }

        return models;
    }

    getModelForInput({
        rawInput,
        usedModels,
        name,
        type
    }: {
        rawInput: string | undefined;
        usedModels: Set<string>;
        name: string;
        type: 'sync' | 'action';
    }): NangoModel | NangoModelField | null {
        if (!rawInput) {
            return null;
        }

        if (isJsOrTsType(rawInput)) {
            return { name: 'input', value: rawInput, tsType: true };
        }

        if (usedModels.has(rawInput)) {
            this.warnings.push(new ParserErrorDuplicateModel({ model: rawInput, path: `${type} > ${name}` }));
        }

        usedModels.add(rawInput);

        const model = this.modelsParser.get(rawInput);
        if (!model) {
            this.errors.push(new ParserErrorModelNotFound({ model: rawInput, path: `${type} > ${name}` }));
            return null;
        }

        return model;
    }
}
