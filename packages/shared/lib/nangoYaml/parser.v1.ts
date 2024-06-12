import type { NangoYamlParsedIntegration, NangoYamlV1, ParsedNangoAction, ParsedNangoSync } from '@nangohq/types';
import { NangoYamlParser } from './parser.js';

export class NangoYamlParserV1 extends NangoYamlParser {
    parse(): void {
        const yaml = this.raw as unknown as NangoYamlV1;
        const output: NangoYamlParsedIntegration[] = [];

        for (const providerConfigKey in yaml.integrations) {
            const integration = yaml.integrations[providerConfigKey];
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
                        endpoint: null,
                        input: null,
                        // output: [],
                        scopes: [], // Scopes was never allowed in v1
                        nango_yaml_version: 'v1',
                        models: []
                    });
                } else {
                    syncs.push({
                        type: 'sync',
                        name: syncOrActionName,
                        description: syncOrAction.description || '',
                        runs: syncOrAction.runs || '',
                        track_deletes: syncOrAction.track_deletes || false,
                        endpoints: [],
                        input: null,
                        // output: [],
                        scopes: [], // Scopes was never allowed in v1
                        auto_start: syncOrAction.auto_start === false ? false : true,
                        models: [],
                        layout_mode: 'root',
                        sync_type: 'incremental',
                        webhookSubscriptions: [],
                        nango_yaml_version: 'v1'
                    });
                }
            }

            const parsedIntegration: NangoYamlParsedIntegration = {
                providerConfigKey,
                syncs,
                actions
            };

            output.push(parsedIntegration);
        }

        this.parsed = {
            yamlVersion: 'v1',
            integrations: output
        };
    }
}
