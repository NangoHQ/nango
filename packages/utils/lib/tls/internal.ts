import { readFileSync } from 'node:fs';
import https from 'node:https';

import { Agent } from 'undici';

import { getLogger } from '../logger.js';

import type { SecureContextOptions } from 'node:tls';

export interface InternalTlsOptions {
    cert?: string | undefined;
    key?: string | undefined;
    ca?: string | undefined;
    passphrase?: string | undefined;
}

type EnvRecord = Record<string, string | undefined>;

const PEM_PREFIX = '-----BEGIN';

function resolveAsset(env: EnvRecord, name: string): string | undefined {
    const inlineVar = `NANGO_INTERNAL_TLS_${name}`;
    const fileVar = `${inlineVar}_FILE`;
    const inline = env[inlineVar]?.trim();
    const file = env[fileVar]?.trim();

    if (inline && file) {
        throw new Error(`Both ${inlineVar} and ${fileVar} are set. Provide only one.`);
    }

    if (file) {
        let content: string;
        try {
            content = readFileSync(file, 'utf8');
        } catch (err) {
            throw new Error(`Unable to read ${fileVar} at '${file}'`, { cause: err });
        }
        if (!content.includes(PEM_PREFIX)) {
            throw new Error(`${fileVar} at '${file}' does not contain a PEM block`);
        }
        return content;
    }

    if (!inline) {
        return undefined;
    }

    if (inline.startsWith(PEM_PREFIX)) {
        return inline;
    }

    const decoded = Buffer.from(inline, 'base64').toString('utf8');
    if (!decoded.startsWith(PEM_PREFIX)) {
        throw new Error(`${inlineVar} is neither a PEM block nor base64-encoded PEM`);
    }
    return decoded;
}

export function loadInternalTlsOptions(env: EnvRecord = process.env): InternalTlsOptions | undefined {
    const cert = resolveAsset(env, 'CERT');
    const key = resolveAsset(env, 'KEY');
    const ca = resolveAsset(env, 'CA');

    if (Boolean(cert) !== Boolean(key)) {
        throw new Error('NANGO_INTERNAL_TLS_CERT and NANGO_INTERNAL_TLS_KEY must be set together.');
    }

    if (!cert && !ca) {
        return undefined;
    }

    const passphrase = env['NANGO_INTERNAL_TLS_KEY_PASSPHRASE'];
    return {
        ...(cert ? { cert } : {}),
        ...(key ? { key } : {}),
        ...(ca ? { ca } : {}),
        ...(passphrase ? { passphrase } : {})
    };
}

const options = loadInternalTlsOptions();

export const internalTlsEnabled = options !== undefined;

if (options) {
    getLogger('internalTls').info(`Internal TLS enabled (client cert: ${Boolean(options.cert)}, ca: ${Boolean(options.ca)})`);
}

export function getInternalTlsOptions(): InternalTlsOptions | undefined {
    return options;
}

let dispatcher: Agent | undefined;
let httpsAgent: https.Agent | undefined;

function getInternalDispatcher(): Agent | undefined {
    if (!options) {
        return undefined;
    }
    dispatcher ??= new Agent({ connect: options as SecureContextOptions });
    return dispatcher;
}

export function withInternalTls(init?: RequestInit): RequestInit {
    const agent = getInternalDispatcher();
    if (!agent) {
        return init ?? {};
    }
    // RequestInit.dispatcher is typed against the undici-types copy bundled with @types/node, which
    // drifts from the undici package Agent comes from. Same object at runtime.
    return { ...init, dispatcher: agent } as unknown as RequestInit;
}

export function getInternalHttpsAgent(): https.Agent | undefined {
    if (!options) {
        return undefined;
    }
    if (!httpsAgent) {
        httpsAgent = new https.Agent({ keepAlive: true, ...options });
        // Agents serialize badly once they hold sockets, so keep them out of logged payloads
        Object.defineProperty(httpsAgent, 'toJSON', { value: () => '[internalTlsAgent]' });
    }
    return httpsAgent;
}
