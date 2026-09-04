import { readFileSync } from 'node:fs';
import https from 'node:https';
import { createSecureContext } from 'node:tls';

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

// The base64 alphabet has no '-', so this also tells an encoded blob apart from a raw one.
function containsPem(value: string): boolean {
    return value.includes(PEM_PREFIX);
}

/**
 * Every branch returns trimmed content so the same certificate resolves identically whether it
 * arrives as raw PEM, base64 PEM, or a file.
 */
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
            content = readFileSync(file, 'utf8').trim();
        } catch (err) {
            const isPermissionError = err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EACCES';
            const hint = isPermissionError
                ? ` (permission denied — if running as USER node, mount the secret with defaultMode 0440 and securityContext.fsGroup: 1000 so the file is group-readable)`
                : '';
            throw new Error(`Unable to read ${fileVar} at '${file}'${hint}`, { cause: err });
        }
        if (!containsPem(content)) {
            throw new Error(`${fileVar} at '${file}' does not contain a PEM block`);
        }
        return content;
    }

    if (!inline) {
        return undefined;
    }

    if (containsPem(inline)) {
        return inline;
    }

    const decoded = Buffer.from(inline, 'base64').toString('utf8').trim();
    if (!containsPem(decoded)) {
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

/**
 * Both agent types accept a wrong passphrase or a mismatched cert/key pair without complaint and
 * only fail on the first request, so force the parse up front.
 */
export function assertUsable(options: InternalTlsOptions): void {
    try {
        createSecureContext(options as SecureContextOptions);
    } catch (err) {
        throw new Error('NANGO_INTERNAL_TLS_* assets were rejected. Check the cert/key pair and NANGO_INTERNAL_TLS_KEY_PASSPHRASE.', { cause: err });
    }
}

const options = loadInternalTlsOptions();

if (options) {
    assertUsable(options);
    getLogger('internalTls').info(`Internal TLS enabled (client cert: ${Boolean(options.cert)}, ca: ${Boolean(options.ca)})`);
}

export function getInternalTlsOptions(): InternalTlsOptions | undefined {
    return options;
}

/**
 * Env vars for a runner the jobs service creates. Runners get an explicit env list rather than the
 * parent's, and the assets are forwarded as resolved PEM because a _FILE path set on jobs points at
 * nothing inside a pod or Lambda that jobs just created.
 */
export function getInternalTlsEnv(opts: InternalTlsOptions | undefined = options): Record<string, string> {
    if (!opts) {
        return {};
    }
    return {
        ...(opts.cert ? { NANGO_INTERNAL_TLS_CERT: opts.cert } : {}),
        ...(opts.key ? { NANGO_INTERNAL_TLS_KEY: opts.key } : {}),
        ...(opts.ca ? { NANGO_INTERNAL_TLS_CA: opts.ca } : {}),
        ...(opts.passphrase ? { NANGO_INTERNAL_TLS_KEY_PASSPHRASE: opts.passphrase } : {})
    };
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
