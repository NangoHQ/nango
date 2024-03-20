import fs from 'fs';
import chalk from 'chalk';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import ms, { StringValue } from 'ms';
import type {
    NangoConfig,
    NangoConfigV1,
    NangoConfigV2,
    StandardNangoConfig,
    NangoSyncConfig,
    NangoSyncModel,
    NangoV2Integration,
    NangoSyncEndpoint,
    NangoIntegrationDataV2
} from '../models/NangoConfig.js';
import type { HTTP_VERB, ServiceResponse } from '../models/Generic.js';
import { SyncType, SyncConfigType } from '../models/Sync.js';
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
        location = `${loadLocation}/${nangoConfigFile}`;
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
            modelFields.push({ name: fieldName, type: fieldType as string });
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
                    models.push({ name: model, fields: modelFields });
                });
            }

            const scopes = sync?.scopes || sync?.metadata?.scopes || [];

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
                nango_yaml_version: 'v1'
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

    const identifierModelFields = modelFields.filter((field) => field.name === identifier);

    if (identifierModelFields.length === 0) {
        return { success: false, error: new NangoError('missing_model_identifier', identifier), response: null };
    }

    inputModel.name = modelNameWithIdentifier as string;
    inputModel.fields = identifierModelFields;

    return { success: true, error: null, response: inputModel };
};

export function convertV2ConfigObject(config: NangoConfigV2, showMessages = false, isPublic?: boolean | null): ServiceResponse<StandardNangoConfig[]> {
    const output: StandardNangoConfig[] = [];
    const allModelNames = config.models ? Object.keys(config.models) : [];

    for (const providerConfigKey in config.integrations) {
        const builtSyncs: NangoSyncConfig[] = [];
        const builtActions: NangoSyncConfig[] = [];

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

        for (const syncName in syncs) {
            const sync: NangoIntegrationDataV2 = syncs[syncName] as NangoIntegrationDataV2;
            const models: NangoSyncModel[] = [];
            const inputModel: NangoSyncModel = {} as NangoSyncModel;

            if (sync.output) {
                const syncReturns = Array.isArray(sync.output) ? sync.output : [sync.output];
                for (const model of syncReturns) {
                    if (!allModels.includes(model)) {
                        if (!isJsOrTsType(model)) {
                            allModels.push(model);
                        }
                    } else {
                        const error = new NangoError('duplicate_model', { model, name: syncName, type: 'sync' });
                        return { success: false, error, response: null };
                    }
                    const modelFields = getFieldsForModel(model, config) as { name: string; type: string }[];
                    models.push({ name: model, fields: modelFields });
                }
            }

            if (sync.input) {
                const modelFields = getFieldsForModel(sync.input, config) as { name: string; type: string }[];
                inputModel.name = sync.input;
                inputModel.fields = modelFields;
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

            const syncObject: NangoSyncConfig = {
                name: syncName,
                type: SyncConfigType.SYNC,
                models: models || [],
                sync_type: sync.sync_type?.toUpperCase() === SyncType.INCREMENTAL ? SyncType.INCREMENTAL : SyncType.FULL,
                runs,
                track_deletes: sync.track_deletes || false,
                auto_start: sync.auto_start === false ? false : true,
                last_deployed: sync.updated_at || null,
                is_public: (isPublic !== undefined ? isPublic : sync.is_public === true) as boolean,
                pre_built: (isPublic !== undefined ? isPublic : sync.pre_built === true) as boolean,
                version: sync.version || null,
                attributes: sync.attributes || {},
                input: inputModel,
                // a sync always returns an array
                returns: Array.isArray(sync.output) ? sync?.output : ([sync.output] as string[]),
                description: sync?.description || sync?.metadata?.description || '',
                scopes: Array.isArray(scopes) ? scopes : String(scopes)?.split(','),
                endpoints,
                nango_yaml_version: sync.nango_yaml_version || 'v2',
                webhookSubscriptions
            };

            if (sync.id) {
                syncObject.id = sync.id;
            }

            builtSyncs.push(syncObject);
        }

        for (const actionName in actions) {
            const action: NangoIntegrationDataV2 = actions[actionName] as NangoIntegrationDataV2;
            const models: NangoSyncModel[] = [];
            let inputModel: NangoSyncModel = {} as NangoSyncModel;

            if (action.output) {
                const actionReturns = Array.isArray(action.output) ? action.output : [action.output];
                for (const model of actionReturns) {
                    if (!model) {
                        continue;
                    }
                    if (!allModels.includes(model)) {
                        if (!isJsOrTsType(model)) {
                            allModels.push(model);
                        }
                    }
                    const modelFields = getFieldsForModel(model, config) as { name: string; type: string }[];
                    models.push({ name: model, fields: modelFields });
                }
            }

            if (action.input) {
                if (action.input.includes('{') && action.input.includes('}')) {
                    // find which model is in between the braces
                    const modelName = action.input.match(/{([^}]+)}/)?.[1];

                    if (!allModelNames.includes(modelName as string)) {
                        throw new Error(`Model ${modelName} not found included in models definition`);
                    }
                }
                const modelFields = getFieldsForModel(action.input, config) as { name: string; type: string }[];
                inputModel.name = action.input;
                inputModel.fields = modelFields;
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

            const actionObject: NangoSyncConfig = {
                name: actionName,
                type: SyncConfigType.ACTION,
                models: models || [],
                runs: '',
                is_public: (isPublic !== undefined ? isPublic : action.is_public === true) as boolean,
                pre_built: (isPublic !== undefined ? isPublic : action.pre_built === true) as boolean,
                version: action.version || null,
                last_deployed: action.updated_at || null,
                attributes: action.attributes || {},
                returns: action.output as string[],
                description: action?.description || action?.metadata?.description || '',
                scopes: Array.isArray(scopes) ? scopes : String(scopes)?.split(','),
                input: inputModel,
                endpoints,
                nango_yaml_version: action.nango_yaml_version || 'v2'
            };

            if (action.id) {
                actionObject.id = action.id;
            }

            builtActions.push(actionObject);
        }

        const simplifiedIntegration: StandardNangoConfig = {
            providerConfigKey,
            syncs: builtSyncs,
            actions: builtActions,
            postConnectionScripts
        };

        output.push(simplifiedIntegration);

        if (provider) {
            simplifiedIntegration.provider = provider as unknown as string;
        }
    }
    return { success: true, error: null, response: output };
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
