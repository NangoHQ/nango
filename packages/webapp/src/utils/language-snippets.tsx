import type { NangoModel, NangoSyncEndpointV2 } from '@nangohq/types';
import type { TargetId } from 'httpsnippet-lite';
import { HTTPSnippet } from 'httpsnippet-lite';
import type { NangoSyncModel } from '../types';
import { modelToString } from './scripts';

function maskSecret(secret: string): string {
    return `${secret.substring(0, 4)}****`;
}

export function nodeSyncSnippet({
    modelName,
    secretKey,
    connectionId,
    providerConfigKey,
    hideSecret = true
}: {
    modelName: string;
    secretKey: string;
    connectionId: string;
    providerConfigKey: string;
    hideSecret?: boolean;
}) {
    return `import { Nango } from '@nangohq/node';
const nango = new Nango({ secretKey: '${hideSecret ? maskSecret(secretKey) : secretKey}' });

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
    input,
    hideSecret = true
}: {
    actionName: string;
    secretKey: string;
    connectionId: string;
    providerConfigKey: string;
    input?: NangoModel | NangoSyncModel;
    hideSecret?: boolean;
}) {
    let snippet = `import Nango from '@nangohq/node';
const nango = new Nango({ secretKey: '${hideSecret ? maskSecret(secretKey) : secretKey}' });

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

const languageToSpec: Record<string, string> = { javascript: 'fetch', php: 'guzzle' };
export async function httpSnippet({
    baseUrl,
    endpoint,
    secretKey,
    connectionId,
    providerConfigKey,
    language,
    input,
    hideSecret = true
}: {
    baseUrl: string;
    endpoint: NangoSyncEndpointV2;
    secretKey: string;
    connectionId: string;
    providerConfigKey: string;
    language: TargetId;
    input?: NangoModel | NangoSyncModel | undefined;
    hideSecret?: boolean;
}) {
    const snippet = new HTTPSnippet({
        method: endpoint.method,
        url: `${baseUrl}/v1${endpoint.path}`,
        headers: [
            { name: 'Authorization', value: `Bearer ${hideSecret ? maskSecret(secretKey) : secretKey}` },
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

    return (await snippet.convert(language, languageToSpec[language], { checkErrors: true })) as string;
}
