import chalk from 'chalk';
import type {
    NangoConfig,
    NangoConfigV1,
    NangoConfigV2,
    StandardNangoConfig,
    NangoSyncConfig,
    NangoSyncModel,
    NangoV2Integration,
    NangoSyncEndpoint,
    NangoIntegrationDataV2,
    LayoutMode
} from '../models/NangoConfig.js';
import type { HTTP_VERB, ServiceResponse } from '../models/Generic.js';
import { SyncType, SyncConfigType } from '../models/Sync.js';
import localFileService from './file/local.service.js';
import { NangoError } from '../utils/error.js';
import { determineVersion, getInterval, isJsOrTsType } from '@nangohq/nango-yaml';

export const nangoConfigFile = 'nango.yaml';
export const SYNC_FILE_EXTENSION = 'js';

export function loadStandardConfig(configData: NangoConfig, showMessages = false, isPublic?: boolean | null): ServiceResponse<StandardNangoConfig[] | null> {
    try {
        if (!configData) {
            return { success: false, error: new NangoError('no_config_found'), response: null };
        }
        const version = determineVersion(configData as any);

        if (!configData.integrations) {
            return { success: true, error: null, response: [] };
        }

        const configServiceResponse =
            version === 'v1' ? convertConfigObject(configData as NangoConfigV1) : convertV2ConfigObject(configData as NangoConfigV2, showMessages, isPublic);

        return configServiceResponse;
    } catch (error: any) {
        return { success: false, error: new NangoError('error_loading_nango_config', error?.message), response: null };
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

export function convertConfigObject(config: NangoConfigV1): ServiceResponse<StandardNangoConfig[]> {
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
            if (sync.returns) {
                const syncReturns = Array.isArray(sync.returns) ? sync.returns : [sync.returns];
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
                type: sync.type || SyncConfigType.SYNC,
                auto_start: sync.auto_start === false ? false : true,
                attributes: sync.attributes || {},
                returns: sync.returns,
                models: models || [],
                description: sync?.description || sync?.metadata?.description || '',
                scopes: Array.isArray(scopes) ? scopes : String(scopes)?.split(','),
                endpoints: sync?.endpoints || [],
                nango_yaml_version: 'v1',
                layout_mode
            };

            if (sync.type === SyncConfigType.ACTION) {
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

const assignEndpoints = (rawEndpoint: string, defaultMethod: HTTP_VERB, singleAllowedMethod = false, showMessages = false) => {
    let endpoints: NangoSyncEndpoint[] = [];
    const endpoint = rawEndpoint.split(' ');

    if (endpoint.length > 1) {
        const method = singleAllowedMethod ? defaultMethod : (endpoint[0]?.toUpperCase() as HTTP_VERB);

        if (singleAllowedMethod && showMessages && endpoint[0]?.toUpperCase() !== defaultMethod) {
            console.log(chalk.yellow(`A sync only allows for a ${defaultMethod} method. The provided ${endpoint[0]?.toUpperCase()} method will be ignored.`));
        }

        endpoints = [
            {
                [method]: endpoint[1] as string
            }
        ];
    } else {
        if (showMessages && !singleAllowedMethod) {
            console.log(chalk.yellow(`No HTTP method provided for endpoint ${endpoint[0]}. Defaulting to ${defaultMethod}.`));
        }
        endpoints = [
            {
                [defaultMethod]: endpoint[0] as string
            }
        ];
    }

    return endpoints;
};

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

const isEnabled = (script: NangoIntegrationDataV2, isPublic: boolean | null, preBuilt: boolean | null): boolean => {
    if (script.enabled !== undefined) {
        return script.enabled;
    }

    if ((isPublic || preBuilt) && !script.version) {
        return false;
    }

    return true;
};

export function convertV2ConfigObject(config: NangoConfigV2, showMessages = false, isPublic?: boolean | null): ServiceResponse<StandardNangoConfig[]> {
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

        // check that every endpoint is unique across syncs and actions
        const allEndpoints: string[] = [];
        const allModels: string[] = [];

        const syncs = integration['syncs'] as NangoV2Integration;
        const actions = integration['actions'] as NangoV2Integration;
        const postConnectionScripts: string[] = (integration['post-connection-scripts'] || []) as string[];

        const {
            success: builtSyncSuccess,
            error: builtSyncError,
            response: builtSyncs
        } = buildSyncs({ syncs, allModelNames, config, providerConfigKey, showMessages, isPublic, allModels, allEndpoints });

        if (!builtSyncSuccess || !builtSyncs) {
            return { success: builtSyncSuccess, error: builtSyncError, response: null };
        }

        const {
            success: builtActionSuccess,
            error: builtActionError,
            response: builtActions
        } = buildActions({ actions, allModelNames, config, providerConfigKey, showMessages, isPublic, allModels, allEndpoints });

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
    allModels,
    allModelNames,
    config,
    name,
    type
}: {
    integrationData: NangoIntegrationDataV2;
    allModels: string[];
    allModelNames: string[];
    config: NangoConfigV2;
    name: string;
    type: 'sync' | 'action';
}): ServiceResponse<NangoSyncModel[]> {
    const models: NangoSyncModel[] = [];
    if (integrationData.output) {
        const integrationDataReturns = Array.isArray(integrationData.output) ? integrationData.output : [integrationData.output];
        for (const model of integrationDataReturns) {
            if (allModels.includes(model) && type === 'sync') {
                const error = new NangoError('duplicate_model', { model, name, type: 'sync' });
                return { success: false, error, response: null };
            }

            if (!allModels.includes(model) && !isJsOrTsType(model)) {
                allModels.push(model);
            }

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
    providerConfigKey,
    showMessages,
    isPublic,
    allModels,
    allEndpoints
}: {
    syncs: NangoV2Integration;
    allModelNames: string[];
    config: NangoConfigV2;
    providerConfigKey: string;
    showMessages: boolean;
    isPublic: boolean | null | undefined;
    allModels: string[];
    allEndpoints: string[];
}): ServiceResponse<NangoSyncConfig[]> {
    const builtSyncs: NangoSyncConfig[] = [];

    for (const syncName in syncs) {
        const sync: NangoIntegrationDataV2 = syncs[syncName] as NangoIntegrationDataV2;
        const {
            success: modelSuccess,
            error: modelError,
            response: models
        } = formModelOutput({ integrationData: sync, allModels, allModelNames, config, name: syncName, type: 'sync' });

        if (!modelSuccess || !models) {
            return { success: false, error: modelError, response: null };
        }

        const inputModel: NangoSyncModel = {} as NangoSyncModel;

        if (sync.input) {
            const modelFields = getFieldsForModel(sync.input, config) as { name: string; type: string }[];
            if (modelFields) {
                inputModel.name = sync.input;
                inputModel.fields = modelFields;
            }
        }

        let endpoints: NangoSyncEndpoint[] = [];
        if (sync?.endpoint) {
            if (Array.isArray(sync.endpoint)) {
                if (sync.endpoint?.length !== sync.output?.length) {
                    const error = new NangoError('endpoint_output_mismatch', syncName);
                    return { success: false, error, response: null };
                }
                for (const endpoint of sync.endpoint) {
                    endpoints.push(...assignEndpoints(endpoint, 'GET', true, showMessages));

                    if (!allEndpoints.includes(endpoint)) {
                        allEndpoints.push(endpoint);
                    } else {
                        const error = new NangoError('duplicate_endpoint', endpoint);
                        return { success: false, error, response: null };
                    }
                }
            } else {
                endpoints = assignEndpoints(sync.endpoint, 'GET', true, showMessages);

                if (sync.output && Array.isArray(sync.output) && sync.output?.length > 1) {
                    const error = new NangoError('endpoint_output_mismatch', syncName);
                    return { success: false, error, response: null };
                }

                if (!allEndpoints.includes(sync.endpoint)) {
                    allEndpoints.push(sync.endpoint);
                } else {
                    const error = new NangoError('duplicate_endpoint', sync.endpoint);
                    return { success: false, error, response: null };
                }
            }
        }

        const scopes = sync?.scopes || sync?.metadata?.scopes || [];

        if (!sync?.runs && showMessages) {
            console.log(chalk.yellow(`No runs property found for sync "${syncName}". Defaulting to every day.`));
        }

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
        const is_public = isPublic !== undefined ? isPublic : sync.is_public === true;
        const pre_built = isPublic !== undefined ? isPublic : sync.pre_built === true;

        const enabled = isEnabled(sync, is_public, pre_built);
        const syncObject: NangoSyncConfig = {
            name: syncName,
            type: SyncConfigType.SYNC,
            models: models || [],
            sync_type: sync.sync_type?.toUpperCase() === SyncType.INCREMENTAL ? SyncType.INCREMENTAL : SyncType.FULL,
            runs,
            track_deletes: sync.track_deletes || false,
            auto_start: sync.auto_start === false ? false : true,
            last_deployed: sync.updated_at || null,
            is_public,
            pre_built,
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
            layout_mode: localFileService.getLayoutMode(syncName, providerConfigKey, 'sync')
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
    providerConfigKey,
    showMessages,
    isPublic,
    allModels,
    allEndpoints
}: {
    actions: NangoV2Integration;
    allModelNames: string[];
    config: NangoConfigV2;
    providerConfigKey: string;
    showMessages: boolean;
    isPublic: boolean | null | undefined;
    allModels: string[];
    allEndpoints: string[];
}): ServiceResponse<NangoSyncConfig[]> {
    const builtActions: NangoSyncConfig[] = [];

    for (const actionName in actions) {
        const action: NangoIntegrationDataV2 = actions[actionName] as NangoIntegrationDataV2;
        const {
            success: modelSuccess,
            error: modelError,
            response: models
        } = formModelOutput({ integrationData: action, allModels, allModelNames, config, name: actionName, type: 'action' });

        if (!modelSuccess || !models) {
            return { success: false, error: modelError, response: null };
        }

        let inputModel: NangoSyncModel = {} as NangoSyncModel;

        if (action.input) {
            if (action.input.includes('{') && action.input.includes('}')) {
                // find which model is in between the braces
                const modelName = action.input.match(/{([^}]+)}/)?.[1];

                if (!allModelNames.includes(modelName as string)) {
                    throw new Error(`Model ${modelName} not found included in models definition`);
                }
            }
            const modelFields = getFieldsForModel(action.input, config) as { name: string; type: string }[];
            if (modelFields) {
                inputModel.name = action.input;
                inputModel.fields = modelFields;
            }
        }

        let endpoints: NangoSyncEndpoint[] = [];
        let actionEndpoint: string;

        if (action?.endpoint) {
            if (Array.isArray(action?.endpoint)) {
                if (action?.endpoint?.length > 1) {
                    const error = new NangoError('action_single_endpoint', actionName);

                    return { success: false, error, response: null };
                }
                actionEndpoint = action?.endpoint[0] as string;
            } else {
                actionEndpoint = action?.endpoint;
            }

            endpoints = assignEndpoints(actionEndpoint, 'POST', false, showMessages);
            if (actionEndpoint?.includes('{') && actionEndpoint.includes('}')) {
                const { success, error, response } = parseModelInEndpoint(actionEndpoint, allModelNames, inputModel, config);
                if (!success || !response) {
                    return { success, error, response: null };
                }
                inputModel = response;
            }

            if (!allEndpoints.includes(actionEndpoint)) {
                allEndpoints.push(actionEndpoint);
            } else {
                const error = new NangoError('duplicate_endpoint', actionEndpoint);
                return { success: false, error, response: null };
            }
        }

        const scopes = action?.scopes || action?.metadata?.scopes || [];
        const is_public = isPublic !== undefined ? isPublic : action.is_public === true;
        const pre_built = isPublic !== undefined ? isPublic : action.pre_built === true;

        const enabled = isEnabled(action, is_public, pre_built);

        const actionObject: NangoSyncConfig = {
            name: actionName,
            type: SyncConfigType.ACTION,
            models: models || [],
            runs: '',
            is_public,
            pre_built,
            version: action.version || null,
            last_deployed: action.updated_at || null,
            attributes: action.attributes || {},
            returns: action.output as string[],
            description: action?.description || action?.metadata?.description || '',
            scopes: Array.isArray(scopes) ? scopes : String(scopes)?.split(','),
            input: inputModel,
            endpoints,
            nango_yaml_version: action.nango_yaml_version || 'v2',
            enabled,
            layout_mode: localFileService.getLayoutMode(actionName, providerConfigKey, 'action')
        };

        if (action.id) {
            actionObject.id = action.id;
        }

        builtActions.push(actionObject);
    }

    return { success: true, error: null, response: builtActions };
}
