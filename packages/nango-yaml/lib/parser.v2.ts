import type {
    NangoModel,
    NangoSyncEndpointV2,
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
import { ParserErrorEndpointsMismatch, ParserErrorInvalidRuns, ParserErrorBothPostConnectionScriptsAndOnEventsPresent } from './errors.js';
import { getInterval, parseEndpoint } from './helpers.js';

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
            const onEventScripts: Record<string, string[]> = integration['on-events'] || {};

            const parsedSyncs = this.parseSyncs({ syncs, integrationName });
            const parseActions = this.parseActions({ actions, integrationName });

            if (postConnectionScripts.length > 0 && Object.values(onEventScripts).length > 0) {
                this.errors.push(new ParserErrorBothPostConnectionScriptsAndOnEventsPresent({ path: [integrationName, 'on-events'] }));
            }
            const parsedOnEventScripts = {
                'post-connection-creation': onEventScripts['post-connection-creation'] || [],
                'pre-connection-deletion': onEventScripts['pre-connection-deletion'] || []
            };

            const parsedIntegration: NangoYamlParsedIntegration = {
                providerConfigKey: integrationName,
                syncs: parsedSyncs,
                actions: parseActions,
                onEventScripts: parsedOnEventScripts,
                ...(postConnectionScripts.length > 0 ? { postConnectionScripts } : {})
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

            const endpoints: NangoSyncEndpointV2[] = [];
            if (sync.endpoint) {
                const tmp = Array.isArray(sync.endpoint) ? sync.endpoint : [sync.endpoint];

                if (tmp.length !== modelOutput.length) {
                    this.errors.push(new ParserErrorEndpointsMismatch({ syncName: syncName, path: [integrationName, 'syncs', syncName] }));
                    continue;
                }

                for (const endpoint of tmp) {
                    endpoints.push(parseEndpoint(endpoint, 'GET'));
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
                sync_type: sync.sync_type?.toLocaleLowerCase() === 'incremental' ? 'incremental' : 'full',
                usedModels: Array.from(modelNames),
                runs: sync.runs,
                version: sync.version || '',
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

            let endpoint: NangoSyncEndpointV2 | null = null;
            if (action.endpoint) {
                endpoint = parseEndpoint(action.endpoint, 'POST');
            }

            const parsedAction: ParsedNangoAction = {
                name: actionName,
                type: 'action',
                description: (action.description || '').trim(),
                version: action.version || '',
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
