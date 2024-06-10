import fs from 'fs';
import chalk from 'chalk';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import type { StringValue } from 'ms';
import ms from 'ms';
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
import { isJsOrTsType } from '../utils/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const nangoConfigFile = 'nango.yaml';
export const SYNC_FILE_EXTENSION = 'js';

interface IntervalResponse {
    interval: StringValue;
    offset: number;
}

export function loadLocalNangoConfig(loadLocation?: string): Promise<NangoConfig | null> {
    let location;

    if (loadLocation) {
        location = path.resolve(`${loadLocation}/${nangoConfigFile}`);
    } else if (process.env['NANGO_INTEGRATIONS_FULL_PATH']) {
        location = path.resolve(process.env['NANGO_INTEGRATIONS_FULL_PATH'], nangoConfigFile);
    } else {
        location = path.resolve(__dirname, `../nango-integrations/${nangoConfigFile}`);
    }

    try {
        const yamlConfig = fs.readFileSync(location, 'utf8');

        const configData: NangoConfig = yaml.load(yamlConfig) as NangoConfig;

        return Promise.resolve(configData);
    } catch {
        console.log(`no nango.yaml config found at ${location}`);
    }

    return Promise.resolve(null);
}

export function determineVersion(configData: NangoConfig): 'v1' | 'v2' {
    if (!configData.integrations || Object.keys(configData.integrations).length === 0) {
        return 'v1';
    }

    const [firstProviderConfigKey] = Object.keys(configData.integrations) as [string];
    const firstProviderConfig = configData.integrations[firstProviderConfigKey] as NangoV2Integration;

    if ('syncs' in firstProviderConfig || 'actions' in firstProviderConfig) {
        return 'v2';
    } else {
        return 'v1';
    }
}

export function loadStandardConfig(configData: NangoConfig, showMessages = false, isPublic?: boolean | null): ServiceResponse<StandardNangoConfig[] | null> {
    try {
        if (!configData) {
            return { success: false, error: new NangoError('no_config_found'), response: null };
        }
        const version = determineVersion(configData);

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
    if (!modelData) {
        return null;
    }

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

function parseModelInEndpoint(endpoint: string, allModelNames: string[], config: NangoConfig): ServiceResponse<NangoSyncModel | null> {
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

        return { success: true, error: null, response: { name: modelNameWithIdentifier!, fields: identifierModelFields } };
    }

    return { success: true, error: null, response: null };
}

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

            if (isJsOrTsType(model)) {
                continue;
            }

            if (!allModels.includes(model)) {
                allModels.push(model);
            }

            const modelFields = getFieldsForModel(model, config);
            if (!modelFields) {
                return { success: false, error: new NangoError('failed_to_find_model', { model }), response: null };
            }

            if (type === 'sync' && !modelFields.find((field) => field.name === 'id')) {
                return { success: false, error: new NangoError('model_should_have_property_id', { model, name }), response: null };
            }

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
                const subModelFields = getFieldsForModel(subModel.type, config);
                if (subModelFields) {
                    const subModelName = subModel.type.replace(/\[\]/g, '');
                    models.push({ name: subModelName, fields: subModelFields });
                }
            }
        }
    }

    return { success: true, error: null, response: models };
}

export function formModelInput({
    integrationData,
    allModels,
    config,
    name,
    type
}: {
    integrationData: NangoIntegrationDataV2;
    allModels: string[];
    config: NangoConfigV2;
    name: string;
    type: 'sync' | 'action';
}): ServiceResponse<NangoSyncModel | string> {
    if (!integrationData.input) {
        return { success: true, error: null, response: null };
    }

    const input = integrationData.input;
    if (isJsOrTsType(input)) {
        return { success: true, error: null, response: input };
    }

    if (allModels.includes(input)) {
        return { success: false, error: new NangoError('duplicate_model', { input, name, type }), response: null };
    }

    allModels.push(input);

    const modelFields = getFieldsForModel(input, config);
    if (!modelFields) {
        return { success: false, error: new NangoError('failed_to_find_model', { model: input }), response: null };
    }

    return { success: true, error: null, response: { name: input, fields: modelFields } };
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

        let inputModel: NangoSyncModel | string | null = null;
        if (sync.input) {
            const model = formModelInput({ allModels, config, integrationData: sync, name: syncName, type: 'sync' });
            if (!model.success || !model.response) {
                return { success: false, error: model.error, response: null };
            }
            inputModel = model.response;
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

        const { success, error } = getInterval(runs, new Date());

        if (!success) {
            return { success: false, error, response: null };
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

        let inputModel: NangoSyncModel | string | null = null;
        if (action.input) {
            const model = formModelInput({ allModels, config, integrationData: action, name: actionName, type: 'action' });
            if (!model.success || !model.response) {
                return { success: false, error: model.error, response: null };
            }
            inputModel = model.response;
        }

        if (action.input) {
            if (action.input.includes('{') && action.input.includes('}')) {
                // find which model is in between the braces
                const modelName = action.input.match(/{([^}]+)}/)?.[1];

                if (!allModelNames.includes(modelName as string)) {
                    return { success: false, error: new NangoError('failed_to_find_model', { model: modelName }), response: null };
                }
            }

            const modelFields = getFieldsForModel(action.input, config);
            if (modelFields) {
                inputModel = { name: action.input, fields: modelFields };
            } else {
                return { success: false, error: new NangoError('failed_to_find_model', { model: action.input }), response: null };
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
                if (inputModel) {
                    return { success: false, error: new NangoError('conflicting_model_and_input'), response: null };
                }

                const { success, error, response } = parseModelInEndpoint(actionEndpoint, allModelNames, config);
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
            returns: models.length > 0 ? [models[0]!.name] : [],
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

export function getOffset(interval: StringValue, date: Date): number {
    const intervalMilliseconds = ms(interval);

    const nowMilliseconds = date.getMinutes() * 60 * 1000 + date.getSeconds() * 1000 + date.getMilliseconds();

    const offset = nowMilliseconds % intervalMilliseconds;

    if (isNaN(offset)) {
        return 0;
    }

    return offset;
}

/**
 * Get Interval
 * @desc get the interval based on the runs property in the yaml. The offset
 * should be the amount of time that the interval should be offset by.
 * If the time is 1536 and the interval is 30m then the next time the sync should run is 1606
 * and then 1636 etc. The offset should be based on the interval and should never be
 * greater than the interval
 */
export function getInterval(runs: string, date: Date): ServiceResponse<IntervalResponse> {
    if (runs === 'every half day') {
        const response: IntervalResponse = { interval: '12h', offset: getOffset('12h', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every half hour') {
        const response: IntervalResponse = { interval: '30m', offset: getOffset('30m', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every quarter hour') {
        const response: IntervalResponse = { interval: '15m', offset: getOffset('15m', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every hour') {
        const response: IntervalResponse = { interval: '1h', offset: getOffset('1h', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every day') {
        const response: IntervalResponse = { interval: '1d', offset: getOffset('1d', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every month') {
        const response: IntervalResponse = { interval: '30d', offset: getOffset('30d', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every week') {
        const response: IntervalResponse = { interval: '1w', offset: getOffset('1w', date) };
        return { success: true, error: null, response };
    }

    const interval = runs.replace('every ', '') as StringValue;

    if (!ms(interval)) {
        const error = new NangoError('sync_interval_invalid');
        return { success: false, error, response: null };
    }

    if (ms(interval) < ms('5m')) {
        const error = new NangoError('sync_interval_too_short');
        return { success: false, error, response: null };
    }

    const offset = getOffset(interval, date);
    const response: IntervalResponse = { interval, offset };

    return { success: true, error: null, response };
}
