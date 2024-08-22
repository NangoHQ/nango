import type { HTTP_VERB, NangoModel, NangoSyncEndpoint } from '@nangohq/types';
import type { NangoSyncModel } from '../types';
import { isProd } from './utils';
import { legacyModelToObject, modelToString } from './scripts';

const maskedKey = '<secret-key-from-environment-settings>';

export function nodeSyncSnippet({
    modelName,
    secretKey,
    connectionId,
    providerConfigKey
}: {
    modelName: string;
    secretKey: string;
    connectionId: string;
    providerConfigKey: string;
}) {
    const secretKeyDisplay = isProd() ? maskedKey : secretKey;

    return `import { Nango } from '@nangohq/node';
const nango = new Nango({ secretKey: '${secretKeyDisplay}' });

const records = await nango.listRecords({
    providerConfigKey: '${providerConfigKey}',
    connectionId: '${connectionId}',
    model: '${modelName}'
});
`;
}

export function nodeActionSnippet({
    actionName,
    secretKey,
    connectionId,
    providerConfigKey,
    input
}: {
    actionName: string;
    secretKey: string;
    connectionId: string;
    providerConfigKey: string;
    input?: NangoModel | NangoSyncModel;
}) {
    const secretKeyDisplay = isProd() ? maskedKey : secretKey;

    let snippet = `import Nango from '@nangohq/node';
const nango = new Nango({ secretKey: '${secretKeyDisplay}' });

const response = await nango.triggerAction(
    '${providerConfigKey}',
    '${connectionId}',
    '${actionName}'`;
    if (input && Object.keys(input).length > 0) {
        snippet += `,
${modelToString(input)}`;
    }
    snippet += `
);`;
    return snippet;
}

export function curlSnippet({
    baseUrl,
    endpoint,
    secretKey,
    connectionId,
    providerConfigKey,
    input,
    method = 'GET'
}: {
    baseUrl: string;
    endpoint: string | NangoSyncEndpoint | NangoSyncEndpoint[];
    secretKey: string;
    connectionId: string;
    providerConfigKey: string;
    input?: NangoModel | NangoSyncModel;
    method?: string;
}) {
    let curlMethod: HTTP_VERB = method as HTTP_VERB;
    const secretKeyDisplay = isProd() ? maskedKey : secretKey;
    if (typeof endpoint !== 'string') {
        curlMethod = Object.keys(endpoint)[0] as HTTP_VERB;
        endpoint = (Array.isArray(endpoint) ? endpoint[0][curlMethod] : endpoint[curlMethod]) as string;
    }

    let snippet = `curl --request ${curlMethod} \\
--url ${baseUrl}/v1${endpoint} \\
--header 'Authorization: Bearer ${secretKeyDisplay}' \\
--header 'Content-Type: application/json' \\
--header 'Connection-Id: ${connectionId}' \\
--header 'Provider-Config-Key: ${providerConfigKey}'`;
    if (input && Object.keys(input).length > 0) {
        snippet += ` \\
--data '${modelToString(input)}'`;
    }

    return snippet;
}

export const autoStartSnippet = (secretKey: string, provider: string, sync: string) => {
    const secretKeyDisplay = isProd() ? maskedKey : secretKey;
    return `import Nango from '@nangohq/node';

const nango = new Nango({ secretKey: '${secretKeyDisplay}' });

await nango.startSync('${provider}', ['${sync}'], '<CONNECTION-ID>');
`;
};

export const setMetadataSnippet = (secretKey: string, provider: string, input?: NangoSyncModel) => {
    return `import Nango from '@nangohq/node';

const nango = new Nango({ secretKey: '${secretKey}' });

await nango.setMetadata(
    '${provider}',
    '<CONNECTION-ID>',
    ${input ? `{\n${JSON.stringify(legacyModelToObject(input), null, 2).split('\n').slice(1).join('\n').replace(/^/gm, '    ')}` : ''}
);
`;
};
