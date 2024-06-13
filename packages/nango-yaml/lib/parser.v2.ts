import type {
    HTTP_VERB,
    NangoModel,
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
    ParserErrorModelIsLiteral
} from './errors.js';
import { getInterval } from './helpers.js';

export class NangoYamlParserV2 extends NangoYamlParser {
    parse(): boolean {
        const yaml = this.raw as unknown as NangoYamlV2;
        const output: NangoYamlParsedIntegration[] = [];
        this.modelsParser.parseAll();

        if (this.modelsParser.errors.length > 0) {
            this.errors.push(...this.modelsParser.errors);
            return false;
        }
        if (this.modelsParser.warnings.length > 0) {
            this.warnings.push(...this.modelsParser.warnings);
        }

        for (const integrationName in yaml.integrations) {
            const integration = yaml.integrations[integrationName];
            if (!integration) {
                continue;
            }

            // check that models are used only once per integration
            const usedModels = new Set<string>();

            const syncs = integration['syncs'];
            const actions = integration['actions'];
            const postConnectionScripts: string[] = integration['post-connection-scripts'] || [];

            const parsedSyncs = this.parseSyncs({ syncs, usedModels, integrationName });
            const parseActions = this.parseActions({ actions, usedModels, integrationName });

            const parsedIntegration: NangoYamlParsedIntegration = {
                providerConfigKey: integrationName,
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

    parseSyncs({
        syncs,
        usedModels,
        integrationName
    }: {
        syncs: NangoYamlV2Integration['syncs'];
        usedModels: Set<string>;
        integrationName: string;
    }): ParsedNangoSync[] {
        const parsedSyncs: ParsedNangoSync[] = [];

        for (const syncName in syncs) {
            const sync = syncs[syncName];
            if (!sync) {
                continue;
            }

            const modelNames = new Set<string>();

            const modelOutput = this.getModelForOutput({ rawOutput: sync.output, usedModels, name: syncName, type: 'sync', integrationName });
            if (!modelOutput) {
                continue;
            }
            modelOutput.forEach((m) => modelNames.add(m.name));

            const modelInput = this.getModelForInput({ usedModels, rawInput: sync.input, name: syncName, type: 'sync', integrationName });
            if (modelInput) {
                modelNames.add(modelInput.name);
            }

            const endpoints: NangoSyncEndpoint[] = [];
            if (sync.endpoint) {
                const tmp = Array.isArray(sync.endpoint) ? sync.endpoint : [sync.endpoint];

                if (tmp.length !== modelOutput.length) {
                    this.errors.push(new ParserErrorEndpointsMismatch({ syncName: syncName, path: [integrationName, 'syncs', syncName] }));
                    continue;
                }

                let failed = false;
                for (const endpoint of tmp) {
                    const split = endpoint.split(' ') as [HTTP_VERB, string];

                    if (this.endpoints.has(endpoint)) {
                        this.errors.push(new ParserErrorDuplicateEndpoint({ endpoint: endpoint, path: [integrationName, 'syncs', syncName] }));
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
                this.errors.push(new ParserErrorInvalidRuns({ message: interval.message, path: [integrationName, 'syncs', syncName] }));
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
                usedModels: Array.from(modelNames),
                runs: sync.runs,
                track_deletes: sync.track_deletes || false,
                auto_start: sync.auto_start === false ? false : true,
                input: modelInput?.name || null,
                output: modelOutput.map((m) => m.name),
                scopes: Array.isArray(sync.scopes) ? sync.scopes : sync.scopes ? sync.scopes.split(',') : [],
                endpoints,
                webhookSubscriptions
            };

            parsedSyncs.push(parsedSync);
        }

        return parsedSyncs;
    }

    parseActions({
        actions,
        usedModels,
        integrationName
    }: {
        actions: NangoYamlV2Integration['actions'];
        usedModels: Set<string>;
        integrationName: string;
    }): ParsedNangoAction[] {
        const parsedActions: ParsedNangoAction[] = [];

        for (const actionName in actions) {
            const action = actions[actionName];
            if (!action) {
                continue;
            }

            const modelNames = new Set<string>();

            const modelOutput = this.getModelForOutput({ rawOutput: action.output, usedModels, name: actionName, type: 'action', integrationName });
            if (modelOutput && modelOutput.length > 0) {
                modelOutput.forEach((m) => modelNames.add(m.name));
            }

            const modelInput = this.getModelForInput({ usedModels, rawInput: action.input, name: actionName, type: 'action', integrationName });
            if (modelInput) {
                modelNames.add(modelInput.name);
            }

            const endpoint: NangoSyncEndpoint = {};
            if (action.endpoint) {
                const split = action.endpoint.split(' ') as [HTTP_VERB, string];

                if (this.endpoints.has(action.endpoint)) {
                    this.errors.push(new ParserErrorDuplicateEndpoint({ endpoint: action.endpoint, path: [integrationName, 'syncs', actionName] }));
                    continue;
                }

                this.endpoints.add(action.endpoint);
                endpoint[split[0]] = split[1];
            }

            const parsedAction: ParsedNangoAction = {
                name: actionName,
                type: 'action',
                description: action.description || '',
                scopes: Array.isArray(action.scopes) ? action.scopes : action.scopes ? action.scopes.split(',') : [],
                input: modelInput?.name || null,
                output: modelOutput && modelOutput.length > 0 ? modelOutput.map((m) => m.name) : null,
                usedModels: Array.from(modelNames),
                endpoint
            };

            parsedActions.push(parsedAction);
        }

        return parsedActions;
    }

    getModelForInput({
        rawInput,
        usedModels,
        name,
        type,
        integrationName
    }: {
        rawInput: string | undefined;
        usedModels: Set<string>;
        name: string;
        type: 'sync' | 'action';
        integrationName: string;
    }): NangoModel | null {
        if (!rawInput) {
            return null;
        }

        if (usedModels.has(rawInput)) {
            this.warnings.push(new ParserErrorDuplicateModel({ model: rawInput, path: [integrationName, type, name, '[input]'] }));
        }

        const model = this.modelsParser.get(rawInput);
        if (model) {
            usedModels.add(rawInput);
            return model;
        }

        // Create anonymous model for validation
        const parsed = this.modelsParser.parseFields({ fields: { input: rawInput }, parent: name });

        this.warnings.push(new ParserErrorModelIsLiteral({ model: rawInput, path: [integrationName, type, name, '[input]'] }));

        const anon = `Anonymous_${integrationName.replace(/[^A-Za-z0-9_]/g, '')}_${type}_${name.replace(/[^A-Za-z0-9_]/g, '')}_input`;
        const anonModel: NangoModel = { name: anon, fields: parsed, isAnon: true };
        this.modelsParser.parsed.set(anon, anonModel);
        usedModels.add(anon);
        return anonModel;
    }
}
