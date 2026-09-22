import { readFileSync } from 'node:fs';
import https from 'node:https';
import { createSecureContext } from 'node:tls';

import * as dotenv from 'dotenv';
import { Agent } from 'undici';

import type { SecureContextOptions } from 'node:tls';

export interface CliTlsOptions {
    cert?: string | undefined;
    key?: string | undefined;
    ca?: string | undefined;
    passphrase?: string | undefined;
}

type EnvRecord = Record<string, string | undefined>;

function extractCertificates(pem: string): string | undefined {
    const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    return blocks?.join('\n');
}

function extractPrivateKey(pem: string): string | undefined {
    return pem.match(/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/)?.[0];
}

function readPemFile(filePath: string, envVar: string): string {
    let content: string;
    try {
        content = readFileSync(filePath, 'utf8');
    } catch (err) {
        throw new Error(`Unable to read ${envVar} at '${filePath}'`, { cause: err });
    }

    const trimmed = content.trim();
    if (!trimmed.includes('-----BEGIN')) {
        throw new Error(`${envVar} at '${filePath}' does not contain a PEM block`);
    }
    return trimmed;
}

export function loadCliTlsOptions(env: EnvRecord = process.env): CliTlsOptions | undefined {
    const certPath = env['NANGO_CLI_TLS_CERT']?.trim();
    const keyPath = env['NANGO_CLI_TLS_KEY']?.trim();
    const caPath = env['NANGO_CLI_TLS_CA']?.trim();

    let cert: string | undefined;
    let keyFromCertFile: string | undefined;
    let key: string | undefined;
    let ca: string | undefined;

    if (certPath) {
        const content = readPemFile(certPath, 'NANGO_CLI_TLS_CERT');
        cert = extractCertificates(content);
        keyFromCertFile = extractPrivateKey(content);
        if (!cert) {
            throw new Error(`NANGO_CLI_TLS_CERT at '${certPath}' does not contain a certificate PEM block`);
        }
    }

    if (keyPath) {
        const content = readPemFile(keyPath, 'NANGO_CLI_TLS_KEY');
        key = extractPrivateKey(content);
        if (!key) {
            throw new Error(`NANGO_CLI_TLS_KEY at '${keyPath}' does not contain a private key PEM block`);
        }
    } else {
        key = keyFromCertFile;
    }

    if (caPath) {
        const content = readPemFile(caPath, 'NANGO_CLI_TLS_CA');
        ca = extractCertificates(content);
        if (!ca) {
            throw new Error(`NANGO_CLI_TLS_CA at '${caPath}' does not contain a certificate PEM block`);
        }
    }

    if (Boolean(cert) !== Boolean(key)) {
        throw new Error('NANGO_CLI_TLS_CERT and NANGO_CLI_TLS_KEY must be set together (or provide both in the cert file).');
    }

    if (!cert && !ca) {
        return undefined;
    }

    const passphrase = env['NANGO_CLI_TLS_KEY_PASSPHRASE'];
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
export function assertUsable(options: CliTlsOptions): void {
    try {
        createSecureContext(options as SecureContextOptions);
    } catch (err) {
        throw new Error('NANGO_CLI_TLS_* assets were rejected. Check the cert/key pair and NANGO_CLI_TLS_KEY_PASSPHRASE.', { cause: err });
    }
}

let loaded: CliTlsOptions | undefined;
let loadError: Error | undefined;
let initialized = false;
let dispatcher: Agent | undefined;
let httpsAgent: https.Agent | undefined;

function getOptions(): CliTlsOptions | undefined {
    if (!initialized) {
        dotenv.config();
        try {
            loaded = loadCliTlsOptions();
            if (loaded) {
                assertUsable(loaded);
            }
        } catch (err) {
            loadError = err instanceof Error ? err : new Error(String(err));
        }
        initialized = true;
    }
    if (loadError) {
        throw loadError;
    }
    return loaded;
}

function getCliDispatcher(): Agent | undefined {
    const options = getOptions();
    if (!options) {
        return undefined;
    }
    dispatcher ??= new Agent({ connect: options as SecureContextOptions });
    return dispatcher;
}

export function withCliTls(init?: RequestInit): RequestInit {
    const agent = getCliDispatcher();
    if (!agent) {
        return init ?? {};
    }
    // RequestInit.dispatcher is typed against the undici-types copy bundled with @types/node, which
    // drifts from the undici package Agent comes from. Same object at runtime.
    return { ...init, dispatcher: agent } as unknown as RequestInit;
}

export function cliFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    return fetch(input, withCliTls(init));
}

export function getCliHttpsAgent(): https.Agent | undefined {
    const options = getOptions();
    if (!options) {
        return undefined;
    }
    if (!httpsAgent) {
        httpsAgent = new https.Agent({ keepAlive: true, ...options });
        Object.defineProperty(httpsAgent, 'toJSON', { value: () => '[cliTlsAgent]' });
    }
    return httpsAgent;
}

export function getCliTlsProps(): { httpsAgent: https.Agent } | Record<string, never> {
    const agent = getCliHttpsAgent();
    return agent ? { httpsAgent: agent } : {};
}
