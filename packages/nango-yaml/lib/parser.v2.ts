import type {
    HTTP_VERB,
    NangoModel,
    NangoSyncEndpoint,
    NangoYamlParsedIntegration,
    NangoYamlV2,
    NangoYamlV2Integration,
    NangoYamlV2IntegrationAction,
    NangoYamlV2IntegrationSync,
    ParsedNangoAction,
    ParsedNangoSync,
    ScriptTypeLiteral
} from '@nangohq/types';
import { NangoYamlParser } from './parser.js';
import { ParserErrorEndpointsMismatch, ParserErrorInvalidRuns } from './errors.js';
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

            const syncs = integration['syncs'];
            const actions = integration['actions'];
            const postConnectionScripts: string[] = integration['post-connection-scripts'] || [];

            const parsedSyncs = this.parseSyncs({ syncs, integrationName });
            const parseActions = this.parseActions({ actions, integrationName });

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

        this.postParsingValidation();

        return this.errors.length <= 0;
    }

    parseSyncs({ syncs, integrationName }: { syncs: NangoYamlV2Integration['syncs']; integrationName: string }): ParsedNangoSync[] {
        const parsedSyncs: ParsedNangoSync[] = [];

        for (const syncName in syncs) {
            const sync = syncs[syncName];
            if (!sync) {
                continue;
            }

            const modelNames = new Set<string>();

            const modelOutput = this.getModelForOutput({ rawOutput: sync.output, name: syncName, type: 'sync', integrationName });
            if (!modelOutput) {
                continue;
            }
            modelOutput.forEach((m) => modelNames.add(m.name));

            const modelInput = this.getModelForInput({ rawInput: sync.input, name: syncName, type: 'sync', integrationName });
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

                for (const endpoint of tmp) {
                    const split = endpoint.split(' ');
                    if (split.length === 2) {
                        endpoints.push({ [split[0] as HTTP_VERB]: split[1] });
                    } else {
                        endpoints.push({ GET: split[0]! });
                    }
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
                description: (sync.description || '').trim(),
                sync_type: sync.sync_type === 'incremental' ? 'incremental' : 'full',
                usedModels: Array.from(modelNames),
                runs: sync.runs,
                track_deletes: sync.track_deletes || false,
                auto_start: sync.auto_start === false ? false : true,
                input: modelInput?.name || null,
                output: modelOutput.map((m) => m.name),
                scopes: this.getScopes(sync),
                endpoints,
                webhookSubscriptions
            };

            parsedSyncs.push(parsedSync);
        }

        return parsedSyncs;
    }

    parseActions({ actions, integrationName }: { actions: NangoYamlV2Integration['actions']; integrationName: string }): ParsedNangoAction[] {
        const parsedActions: ParsedNangoAction[] = [];

        for (const actionName in actions) {
            const action = actions[actionName];
            if (!action) {
                continue;
            }

            const modelNames = new Set<string>();

            const modelOutput = this.getModelForOutput({ rawOutput: action.output, name: actionName, type: 'action', integrationName });
            if (modelOutput && modelOutput.length > 0) {
                modelOutput.forEach((m) => modelNames.add(m.name));
            }

            const modelInput = this.getModelForInput({ rawInput: action.input, name: actionName, type: 'action', integrationName });
            if (modelInput) {
                modelNames.add(modelInput.name);
            }

            const endpoint: NangoSyncEndpoint = {};
            if (action.endpoint) {
                const split = action.endpoint.split(' ');
                if (split.length === 2) {
                    endpoint[split[0]! as HTTP_VERB] = split[1]!;
                } else {
                    endpoint['POST'] = split[0]!;
                }
            }

            const parsedAction: ParsedNangoAction = {
                name: actionName,
                type: 'action',
                description: (action.description || '').trim(),
                scopes: this.getScopes(action),
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
        name,
        type,
        integrationName
    }: {
        rawInput: string | undefined;
        name: string;
        type: ScriptTypeLiteral;
        integrationName: string;
    }): NangoModel | null {
        if (!rawInput) {
            return null;
        }

        const model = this.modelsParser.get(rawInput);
        if (model) {
            return model;
        }

        // Create anonymous model for validation
        const parsed = this.modelsParser.parseFields({ fields: { input: rawInput }, stack: new Set([name]) });

        const anon = `Anonymous_${integrationName.replace(/[^A-Za-z0-9_]/g, '')}_${type}_${name.replace(/[^A-Za-z0-9_]/g, '')}_input`;
        const anonModel: NangoModel = { name: anon, fields: parsed, isAnon: true };
        this.modelsParser.parsed.set(anon, anonModel);
        return anonModel;
    }

    private getScopes(syncOrAction: NangoYamlV2IntegrationAction | NangoYamlV2IntegrationSync) {
        if (Array.isArray(syncOrAction.scopes)) {
            return syncOrAction.scopes;
        }
        return syncOrAction.scopes?.split(',') || [];
    }
}
