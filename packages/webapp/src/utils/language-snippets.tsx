import type { NangoModel, NangoSyncEndpoint } from '@nangohq/types';
import type { TargetId } from 'httpsnippet-lite';
import { HTTPSnippet } from 'httpsnippet-lite';
import type { NangoSyncModel } from '../types';
import { isProd } from './utils';
import { modelToString } from './scripts';

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

export async function httpSnippet({
    baseUrl,
    endpoint,
    secretKey,
    connectionId,
    providerConfigKey,
    language,
    languageSpec,
    input
}: {
    baseUrl: string;
    endpoint: NangoSyncEndpoint;
    secretKey: string;
    connectionId: string;
    providerConfigKey: string;
    language: TargetId;
    languageSpec?: string;
    input?: NangoModel | NangoSyncModel;
}) {
    const [method, path] = Object.entries(endpoint)[0];
    const secretKeyDisplay = isProd() ? maskedKey : secretKey;

    const snippet = new HTTPSnippet({
        method,
        url: `${baseUrl}/v1${path}`,
        headers: [
            { name: 'Authorization', value: `Bearer ${secretKeyDisplay}` },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Connection-Id', value: connectionId },
            { name: 'Provider-Config-Key', value: providerConfigKey }
        ],
        postData: input
            ? { mimeType: 'application/json', text: language === 'shell' ? modelToString(input) : modelToString(input).replaceAll('\n', '') }
            : undefined,
        bodySize: 10,
        cookies: [],
        headersSize: 0,
        httpVersion: '1',
        queryString: []
    });

    return (await snippet.convert(language, languageSpec)) as string;
}
