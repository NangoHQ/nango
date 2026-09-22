import { createHash, createHmac } from 'node:crypto';
import dns from 'node:dns/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_OUTBOUND_URL_POLICY, getSafeHttpAgents } from '@nangohq/egress';
import { connectionService } from '@nangohq/shared';
import { axiosInstance } from '@nangohq/utils';

import route from './connectwise-psa-webhook-routing.js';

import type { InternalNango } from './internal-nango.js';
import type { ConnectWisePsaWebhookPayload } from './types.js';
import type { DBConnectionDecrypted } from '@nangohq/types';
import type { LookupFunction } from 'node:net';

const origin = 'https://cw.example.com';
const secret = 'test-signing-key';
const customKeyUrl = `${origin}/v4_6_release//system/callbackkey/index.rails?id=test`;
const cloudKeyUrl = 'https://api-na.myconnectwise.net/v4_6_release/system/callbackkey/index.rails?id=test';

function connection(id: string, keyOrigin: unknown = origin) {
    return { connection_id: id, metadata: { productInstanceId: 'instance-1', connectwiseWebhookKeyOrigin: keyOrigin } } as unknown as DBConnectionDecrypted;
}

function setup(connections = [connection('conn-1')]) {
    const find = vi.spyOn(connectionService, 'findConnectionsByMetadataValue').mockResolvedValue(connections);
    const get = vi.spyOn(axiosInstance, 'get').mockResolvedValue({ data: { signing_key: secret } });
    const execute = vi
        .fn()
        .mockImplementation(({ connectionIdentifierValue }) =>
            Promise.resolve({ connectionIds: [connectionIdentifierValue || 'cloud-connection'], connectionMetadata: {} })
        );
    const nango = { integration: { id: 10 }, environment: { id: 20 }, executeScriptForWebhooks: execute } as unknown as InternalNango;
    return { nango, find, get, execute };
}

function send(nango: InternalNango, keyUrl = customKeyUrl, overrides: Partial<ConnectWisePsaWebhookPayload> = {}, tamper = false) {
    const body: ConnectWisePsaWebhookPayload = { ProductInstanceId: 'instance-1', Type: 'ticket', ID: 123, Metadata: { key_url: keyUrl }, ...overrides };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', createHash('sha256').update(secret).digest()).update(rawBody).digest('base64');
    return route(nango, { 'x-content-signature': signature }, body, tamper ? `${rawBody} ` : rawBody, {});
}

afterEach(() => vi.restoreAllMocks());

describe('ConnectWise PSA webhook signing-key origins', () => {
    it('keeps cloud routing without requiring custom metadata', async () => {
        const { nango, find, execute } = setup([]);
        expect((await send(nango, cloudKeyUrl)).isOk()).toBe(true);
        expect(find).not.toHaveBeenCalled();
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifier: 'ProductInstanceId', propName: 'metadata.productInstanceId' }));
    });

    it('looks up the instance within the integration/environment and dispatches only to connections that trust the origin', async () => {
        const { nango, find, get, execute } = setup([
            connection('conn-1'),
            connection('wrong-origin', 'https://other.example.com'),
            connection('conn-2', `${origin}/`)
        ]);
        const result = await send(nango);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) expect(result.value).toMatchObject({ connectionIds: ['conn-1', 'conn-2'] });
        expect(find).toHaveBeenCalledWith({ metadataProperty: 'productInstanceId', payloadIdentifier: 'instance-1', configId: 10, environmentId: 20 });
        expect(get).toHaveBeenCalledOnce();
        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ connectionIdentifierValue: 'conn-1', propName: 'connectionId' }));
        expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ connectionIdentifierValue: 'conn-2', propName: 'connectionId' }));
    });

    it.each([
        undefined,
        null,
        1,
        [],
        'https://other.example.com',
        'http://cw.example.com',
        `${origin}/path`,
        `${origin}?query=1`,
        `${origin}#fragment`,
        'https://user:pass@cw.example.com'
    ])('rejects missing, malformed or mismatched metadata: %s', async (configured) => {
        const { nango, get, execute } = setup([connection('conn-1', configured === undefined ? null : configured)]);
        expect((await send(nango)).isErr()).toBe(true);
        expect(get).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an unknown instance before fetching any key', async () => {
        const { nango, get, execute } = setup([]);
        expect((await send(nango)).isErr()).toBe(true);
        expect(get).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([undefined, '', 123])('rejects missing or invalid instance IDs: %s', async (id) => {
        const { nango, find, get } = setup();
        expect((await send(nango, customKeyUrl, { ProductInstanceId: id as string })).isErr()).toBe(true);
        expect(find).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
    });

    it.each([
        'http://cw.example.com/key',
        'https://user:pass@cw.example.com/key',
        `${customKeyUrl}#fragment`,
        'not a url',
        'https://cw.example.com.evil.test/key',
        'https://cw.example.com:444/key',
        'https://evil.myconnectwise.net/key'
    ])('rejects untrusted key URLs: %s', async (url) => {
        const { nango, get, execute } = setup();
        expect((await send(nango, url)).isErr()).toBe(true);
        expect(get).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it.each(['https://127.0.0.1', 'https://169.254.169.254', 'https://10.0.0.1', 'https://[::1]', 'https://[::ffff:127.0.0.1]'])(
        'rejects private targets even when explicitly configured: %s',
        async (configured) => {
            const { nango, get, execute } = setup([connection('conn-1', configured)]);
            expect((await send(nango, `${configured}/key`)).isErr()).toBe(true);
            expect(get).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
        }
    );

    it('uses a DNS-validating agent and blocks redirects and proxy overrides', async () => {
        const { nango, get } = setup();
        expect((await send(nango)).isOk()).toBe(true);
        expect(get).toHaveBeenCalledWith(
            customKeyUrl,
            expect.objectContaining({
                ...getSafeHttpAgents(DEFAULT_OUTBOUND_URL_POLICY),
                proxy: false,
                maxRedirects: 0,
                timeout: 10000,
                maxContentLength: 65536
            })
        );
        vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
        const lookup = getSafeHttpAgents(DEFAULT_OUTBOUND_URL_POLICY).httpsAgent.options.lookup as LookupFunction;
        const error = await new Promise((resolve) => lookup('rebound.example.com', {}, (err) => resolve(err)));
        expect(error).toBeInstanceOf(Error);
    });

    it.each([cloudKeyUrl, customKeyUrl])('rejects a tampered body for %s', async (url) => {
        const { nango, execute } = setup();
        expect((await send(nango, url, {}, true)).isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects unsigned events before looking up connections or keys', async () => {
        const { nango, find, get, execute } = setup();
        expect((await route(nango, {}, {}, '{}', {})).isErr()).toBe(true);
        expect(find).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([{}, { signing_key: '' }, { signing_key: 123 }])('rejects invalid signing-key responses: %j', async (data) => {
        const { nango, get, execute } = setup();
        get.mockResolvedValue({ data });
        expect((await send(nango)).isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects failed key fetches without dispatching', async () => {
        const { nango, get, execute } = setup();
        get.mockRejectedValue(new Error('key fetch failed'));
        expect((await send(nango)).isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });
});
