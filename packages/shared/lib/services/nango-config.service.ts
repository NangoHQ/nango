import type {
    NangoConfig,
    NangoConfigV1,
    NangoConfigV2,
    StandardNangoConfig,
    NangoSyncConfig,
    NangoSyncModel,
    NangoV2Integration,
    NangoIntegrationDataV2,
    LayoutMode
} from '../models/NangoConfig.js';
import type { ServiceResponse } from '../models/Generic.js';
import { SyncType } from '../models/Sync.js';
import localFileService from './file/local.service.js';
import { NangoError } from '../utils/error.js';
import { determineVersion, getInterval, isJsOrTsType, parseEndpoint } from '@nangohq/nango-yaml';
import type { NangoSyncEndpointV2 } from '@nangohq/types';

/**
 * Legacy parser only used for flows.yaml
 * TODO: kill this in favor of nango-yaml + transformation to StandardNangoConfig
 */
export function loadStandardConfig(configData: NangoConfig): ServiceResponse<StandardNangoConfig[] | null> {
    try {
        if (!configData) {
            return { success: false, error: new NangoError('no_config_found'), response: null };
        }
        const version = determineVersion(configData as any);

        if (!configData.integrations) {
            return { success: true, error: null, response: [] };
        }

        const configServiceResponse = version === 'v1' ? convertConfigObject(configData as NangoConfigV1) : convertV2ConfigObject(configData as NangoConfigV2);

        return configServiceResponse;
    } catch (error) {
        return { success: false, error: new NangoError('error_loading_nango_config', error instanceof Error ? error.message : {}), response: null };
    }
}

function getFieldsForModel(modelName: string, config: NangoConfig): { name: string; type: string }[] | null {
    const modelFields = [];

    if (isJsOrTsType(modelName)) {
        return null;
    }

    if (!config.models || Object.keys(config.models).length === 0) {
        return null;
    }

    // if it is an array of models, we still need to be able to recognize it
    const strippedModelName = modelName.replace(/\[\]/g, '');

    const modelData = config.models[strippedModelName];

    for (const fieldName in modelData) {
        const fieldType = modelData[fieldName];
        if (fieldName === '__extends') {
            const extendedModels = (fieldType as string).split(',');
            for (const extendedModel of extendedModels) {
                const extendedFields = getFieldsForModel(extendedModel.trim(), config);
                if (extendedFields) {
                    modelFields.push(...extendedFields);
                }
            }
        } else if (typeof fieldType === 'object') {
            for (const subFieldName in fieldType) {
                const subFieldType = fieldType[subFieldName];
                modelFields.push({ name: `${fieldName}.${subFieldName}`, type: subFieldType as string });
            }
        } else {
            modelFields.push({ name: fieldName, type: fieldType?.trim() as string });
        }
    }

    return modelFields;
}

function convertConfigObject(config: NangoConfigV1): ServiceResponse<StandardNangoConfig[]> {
    const output = [];

    for (const providerConfigKey in config.integrations) {
        const syncs = [];
        const actions = [];
        const integration = config.integrations[providerConfigKey];
        let provider;

        if (integration!['provider']) {
            provider = integration!['provider'];
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete integration!['provider'];
        }

        for (const syncName in integration) {
            const sync: NangoSyncConfig = integration[syncName] as unknown as NangoSyncConfig;
            const models: NangoSyncModel[] = [];
            const syncReturns = Array.isArray(sync.returns) ? sync.returns : [sync.returns];
            if (sync.returns) {
                syncReturns.forEach((model) => {
                    const modelFields = getFieldsForModel(model, config) as { name: string; type: string }[];
                    if (modelFields) {
                        models.push({ name: model, fields: modelFields });
                    }
                });
            }

            const scopes = sync?.scopes || sync?.metadata?.scopes || [];

            const layout_mode: LayoutMode = 'root';

            const flowObject = {
                name: syncName,
                runs: sync.runs || '',
                track_deletes: sync.track_deletes || false,
                type: sync.type || 'sync',
                auto_start: sync.auto_start === false ? false : true,
                attributes: sync.attributes || {},
                returns: syncReturns,
                models: models || [],
                description: sync?.description || sync?.metadata?.description || '',
                scopes: Array.isArray(scopes) ? scopes : String(scopes)?.split(','),
                endpoints: sync?.endpoints || [],
                nango_yaml_version: 'v1',
                layout_mode,
                json_schema: null
            };

            if (sync.type === 'action') {
                actions.push(flowObject);
            } else {
                syncs.push(flowObject);
            }
        }

        const simplifiedIntegration: StandardNangoConfig = {
            providerConfigKey,
            syncs,
            actions
        };

        if (provider) {
            simplifiedIntegration.provider = provider as unknown as string;
        }

        output.push(simplifiedIntegration);
    }
    return { success: true, error: null, response: output };
}

const parseModelInEndpoint = (endpoint: string, allModelNames: string[], inputModel: NangoSyncModel, config: NangoConfig): ServiceResponse<NangoSyncModel> => {
    if (Object.keys(inputModel).length > 0) {
        return { success: false, error: new NangoError('conflicting_model_and_input'), response: null };
    }

    const modelNameWithIdentifier = endpoint.match(/{([^}]+)}/)?.[1];
    const modelNameWithIdentifierArray = modelNameWithIdentifier?.split(':');

    if (!modelNameWithIdentifierArray || modelNameWithIdentifierArray?.length < 2) {
        return { success: false, error: new NangoError('invalid_model_identifier', modelNameWithIdentifier), response: null };
    }

    const [modelName, identifier] = modelNameWithIdentifierArray;

    if (!allModelNames.includes(modelName as string)) {
        return { success: false, error: new NangoError('missing_model_name', modelName), response: null };
    }

    const modelFields = getFieldsForModel(modelName as string, config) as { name: string; type: string }[];

    if (modelFields) {
        const identifierModelFields = modelFields.filter((field) => field.name === identifier);

        if (identifierModelFields.length === 0) {
            return { success: false, error: new NangoError('missing_model_identifier', identifier), response: null };
        }

        inputModel.name = modelNameWithIdentifier as string;
        inputModel.fields = identifierModelFields;
    }

    return { success: true, error: null, response: inputModel };
};

const isEnabled = (script: NangoIntegrationDataV2): boolean => {
    if (script.enabled !== undefined) {
        return script.enabled;
    }

    return false;
};

function convertV2ConfigObject(config: NangoConfigV2): ServiceResponse<StandardNangoConfig[]> {
    const output: StandardNangoConfig[] = [];
    const allModelNames = config.models ? Object.keys(config.models) : [];

    for (const providerConfigKey in config.integrations) {
        const integration: NangoV2Integration = config.integrations[providerConfigKey] as NangoV2Integration;
        let provider;

        if (integration['provider']) {
            provider = integration['provider'];
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete integration['provider'];
        }

        const syncs = integration['syncs'] as NangoV2Integration;
        const actions = integration['actions'] as NangoV2Integration;
        const postConnectionScripts: string[] = (integration['post-connection-scripts'] || []) as string[];

        const { success: builtSyncSuccess, error: builtSyncError, response: builtSyncs } = buildSyncs({ syncs, allModelNames, config, providerConfigKey });

        if (!builtSyncSuccess || !builtSyncs) {
            return { success: builtSyncSuccess, error: builtSyncError, response: null };
        }

        const {
            success: builtActionSuccess,
            error: builtActionError,
            response: builtActions
        } = buildActions({ actions, allModelNames, config, providerConfigKey });

        if (!builtActionSuccess || !builtActions) {
            return { success: builtActionSuccess, error: builtActionError, response: null };
        }

        const simplifiedIntegration: StandardNangoConfig = {
            providerConfigKey,
            syncs: builtSyncs ? builtSyncs : [],
            actions: builtActions ? builtActions : [],
            postConnectionScripts
        };

        output.push(simplifiedIntegration);

        if (provider) {
            simplifiedIntegration.provider = provider as unknown as string;
        }
    }
    return { success: true, error: null, response: output };
}

function formModelOutput({
    integrationData,
    allModelNames,
    config
}: {
    integrationData: NangoIntegrationDataV2;
    allModelNames: string[];
    config: NangoConfigV2;
}): ServiceResponse<NangoSyncModel[]> {
    const models: NangoSyncModel[] = [];
    if (integrationData.output) {
        const integrationDataReturns = Array.isArray(integrationData.output) ? integrationData.output : [integrationData.output];
        for (const model of integrationDataReturns) {
            const modelFields = getFieldsForModel(model, config) as { name: string; type: string }[];

            if (modelFields) {
                models.push({ name: model, fields: modelFields });
                const subModels = modelFields.filter((field) => {
                    if (typeof field?.type === 'string') {
                        const cleanType = field.type.replace(/\[\]/g, '');
                        return allModelNames.some((m) => m.includes(cleanType));
                    } else {
                        return false;
                    }
                });

                for (const subModel of subModels) {
                    const subModelFields = getFieldsForModel(subModel.type, config) as { name: string; type: string }[];
                    if (subModelFields) {
                        const subModelName = subModel.type.replace(/\[\]/g, '');
                        models.push({ name: subModelName, fields: subModelFields });
                    }
                }
            }
        }
    }

    return { success: true, error: null, response: models };
}

function buildSyncs({
    syncs,
    allModelNames,
    config,
    providerConfigKey
}: {
    syncs: NangoV2Integration;
    allModelNames: string[];
    config: NangoConfigV2;
    providerConfigKey: string;
}): ServiceResponse<NangoSyncConfig[]> {
    const builtSyncs: NangoSyncConfig[] = [];

    for (const syncName in syncs) {
        const sync: NangoIntegrationDataV2 = syncs[syncName] as NangoIntegrationDataV2;
        const { success: modelSuccess, error: modelError, response: models } = formModelOutput({ integrationData: sync, allModelNames, config });

        if (!modelSuccess || !models) {
            return { success: false, error: modelError, response: null };
        }

        let inputModel: NangoSyncModel | undefined = undefined;

        if (sync.input) {
            const modelFields = getFieldsForModel(sync.input, config) as { name: string; type: string }[];
            if (modelFields) {
                inputModel = {
                    name: sync.input,
                    fields: modelFields
                };
            }
        }

        const endpoints: NangoSyncEndpointV2[] = [];
        if (sync?.endpoint) {
            if (Array.isArray(sync.endpoint)) {
                for (const endpoint of sync.endpoint) {
                    const parsed = parseEndpoint(endpoint, 'GET');
                    endpoints.push(parsed);
                }
            } else {
                const parsed = parseEndpoint(sync.endpoint, 'GET');
                endpoints.push(parsed);
            }
        }

        const scopes = sync?.scopes || sync?.metadata?.scopes || [];

        const runs = sync?.runs || 'every day';

        const interval = getInterval(runs, new Date());
        if (interval instanceof Error) {
            return { success: false, error: new NangoError(interval.message), response: null };
        }

        let webhookSubscriptions: string[] = [];

        if (sync['webhook-subscriptions']) {
            if (Array.isArray(sync['webhook-subscriptions'])) {
                webhookSubscriptions = sync['webhook-subscriptions'];
            } else {
                webhookSubscriptions = [sync['webhook-subscriptions'] as string];
            }
        }

        const enabled = isEnabled(sync);
        const syncObject: NangoSyncConfig = {
            name: syncName,
            type: 'sync',
            models: models || [],
            sync_type: sync.sync_type?.toUpperCase() === SyncType.FULL ? SyncType.FULL : SyncType.INCREMENTAL,
            runs,
            track_deletes: sync.track_deletes || false,
            auto_start: sync.auto_start === false ? false : true,
            last_deployed: sync.updated_at || null,
            is_public: true,
            pre_built: true,
            version: sync.version || null,
            attributes: sync.attributes || {},
            input: inputModel,
            // a sync always returns an array
            returns: Array.isArray(sync.output) ? sync?.output : ([sync.output] as string[]),
            description: sync?.description || sync?.metadata?.description || '',
            scopes: Array.isArray(scopes) ? scopes : String(scopes)?.split(','),
            endpoints,
            nango_yaml_version: sync.nango_yaml_version || 'v2',
            webhookSubscriptions,
            enabled,
            layout_mode: localFileService.getLayoutMode(syncName, providerConfigKey, 'sync'),
            json_schema: null
        };

        if (sync.id) {
            syncObject.id = sync.id;
        }

        builtSyncs.push(syncObject);
    }

    return { success: true, error: null, response: builtSyncs };
}

function buildActions({
    actions,
    allModelNames,
    config,
    providerConfigKey
}: {
    actions: NangoV2Integration;
    allModelNames: string[];
    config: NangoConfigV2;
    providerConfigKey: string;
}): ServiceResponse<NangoSyncConfig[]> {
    const builtActions: NangoSyncConfig[] = [];

    for (const actionName in actions) {
        const action: NangoIntegrationDataV2 = actions[actionName] as NangoIntegrationDataV2;
        const { success: modelSuccess, error: modelError, response: models } = formModelOutput({ integrationData: action, allModelNames, config });

        if (!modelSuccess || !models) {
            return { success: false, error: modelError, response: null };
        }

        let inputModel: NangoSyncModel | undefined = undefined;

        if (action.input) {
            const modelFields = getFieldsForModel(action.input, config) as { name: string; type: string }[];
            if (modelFields) {
                inputModel = {
                    name: action.input,
                    fields: modelFields
                };
            }
        }

        let endpoint: NangoSyncEndpointV2 | undefined;

        if (action?.endpoint) {
            endpoint = parseEndpoint(action.endpoint as string | NangoSyncEndpointV2, 'POST');
            if (endpoint.path?.includes('{') && endpoint.path.includes('}')) {
                const { success, error, response } = parseModelInEndpoint(endpoint.path, allModelNames, inputModel!, config);
                if (!success || !response) {
                    return { success, error, response: null };
                }
                inputModel = response;
            }
        }

        const scopes = action?.scopes || action?.metadata?.scopes || [];

        const enabled = isEnabled(action);

        const actionObject: NangoSyncConfig = {
            name: actionName,
            type: 'action',
            models: models || [],
            runs: '',
            is_public: true,
            pre_built: true,
            version: action.version || null,
            last_deployed: action.updated_at || null,
            attributes: action.attributes || {},
            returns: Array.isArray(action.output) ? action.output : action.output ? [action.output] : [],
            description: action?.description || action?.metadata?.description || '',
            scopes: Array.isArray(scopes) ? scopes : String(scopes)?.split(','),
            input: inputModel,
            endpoints: endpoint ? [endpoint] : [],
            nango_yaml_version: action.nango_yaml_version || 'v2',
            enabled,
            // TODO: remove this, this obviously does not work cloud and also it's useless?
            layout_mode: localFileService.getLayoutMode(actionName, providerConfigKey, 'action'),
            json_schema: null
        };

        if (action.id) {
            actionObject.id = action.id;
        }

        builtActions.push(actionObject);
    }

    return { success: true, error: null, response: builtActions };
}
