import type { NangoYamlParsedIntegration, NangoYamlV1, ParsedNangoAction, ParsedNangoSync } from '@nangohq/types';
import { NangoYamlParser } from './parser.js';

export class NangoYamlParserV1 extends NangoYamlParser {
    parse(): boolean {
        const yaml = this.raw as unknown as NangoYamlV1;
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

            const syncs: ParsedNangoSync[] = [];
            const actions: ParsedNangoAction[] = [];

            for (const syncOrActionName in integration) {
                const syncOrAction = integration[syncOrActionName];
                if (!syncOrAction) {
                    continue;
                }

                // TODO: models

                if (syncOrAction.type === 'action') {
                    actions.push({
                        type: 'action',
                        name: syncOrActionName,
                        description: syncOrAction.description || '',
                        endpoint: null, // Endpoint was never allowed in v1
                        input: null,
                        output: null,
                        scopes: [], // Scopes was never allowed in v1
                        usedModels: []
                    });
                } else {
                    const modelOutput = this.getModelForOutput({
                        rawOutput: syncOrAction.returns,
                        usedModels: new Set(),
                        name: syncOrActionName,
                        type: 'sync',
                        integrationName
                    });
                    if (!modelOutput) {
                        continue;
                    }

                    syncs.push({
                        type: 'sync',
                        name: syncOrActionName,
                        description: syncOrAction.description || '',
                        runs: syncOrAction.runs || '',
                        track_deletes: syncOrAction.track_deletes || false,
                        endpoints: [], // Endpoint was never allowed in v1
                        input: null,
                        output: modelOutput.map((m) => m.name),
                        scopes: [], // Scopes was never allowed in v1
                        auto_start: syncOrAction.auto_start === false ? false : true,
                        usedModels: modelOutput.map((m) => m.name),
                        sync_type: 'incremental',
                        webhookSubscriptions: []
                    });
                }
            }

            const parsedIntegration: NangoYamlParsedIntegration = {
                providerConfigKey: integrationName,
                syncs,
                actions,
                postConnectionScripts: []
            };

            output.push(parsedIntegration);
        }

        this.parsed = {
            yamlVersion: 'v1',
            integrations: output,
            models: this.modelsParser.parsed
        };

        return this.errors.length <= 0;
    }
}
