import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertUsable, loadCliTlsOptions } from './tls.js';

const CERT_PEM = '-----BEGIN CERTIFICATE-----\nnot-a-real-cert\n-----END CERTIFICATE-----';
const KEY_PEM = '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----';
const CA_PEM = '-----BEGIN CERTIFICATE-----\nnot-a-real-ca\n-----END CERTIFICATE-----';

// Self-signed P-256 pair generated once so assertUsable tests do not need openssl on PATH.
const MATCHING_CERT = `-----BEGIN CERTIFICATE-----
MIIBjzCCATWgAwIBAgIUaoKlmeeRdbaAwRLn8tZdXdhpjrwwCgYIKoZIzj0EAwIw
HTEbMBkGA1UEAwwSbmFuZ28tY2xpLXRscy10ZXN0MB4XDTI2MDkwMTEzNDQwN1oX
DTM2MDgyOTEzNDQwN1owHTEbMBkGA1UEAwwSbmFuZ28tY2xpLXRscy10ZXN0MFkw
EwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE9C8I1/BL7ccCiiEFoVRM+m13Pgz5aDea
I4PFvmHZh3EzwHcEdQzgNjs7Mb38GX/VeUOAoU+tBWpjvYZ0L0m9+KNTMFEwHQYD
VR0OBBYEFOgJ4jFa/SACHANwOhCMh5+x/XCXMB8GA1UdIwQYMBaAFOgJ4jFa/SAC
HANwOhCMh5+x/XCXMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIh
ALaGoEVwiKb0QosrD9FbUEUgxjs/+yHRqRH+52vhL9MzAiBbgNYVDC78/aUibM/m
VhdNweIaxiFUL2Ae+vNhA+0HDQ==
-----END CERTIFICATE-----`;
const MATCHING_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgthRWd8LlnHuU30k3
Wz0C8pUuMuzMy/31nIGLN3tbnMihRANCAAT0LwjX8EvtxwKKIQWhVEz6bXc+DPlo
N5ojg8W+YdmHcTPAdwR1DOA2OzsxvfwZf9V5Q4ChT60FamO9hnQvSb34
-----END PRIVATE KEY-----`;
const OTHER_KEY = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIJ41vDsPyf0nLzChwZwzc/y6MgAiEeomTL22d7qRInJDoAoGCCqGSM49
AwEHoUQDQgAEWipesL9YfO0TFEZbjBNgP8oshmWcnkpIoLZWtLyicmn5WYy34gH5
4suihUnIvMEAT9qezfGVcP05Yvpfeh9xRw==
-----END EC PRIVATE KEY-----`;

const dir = mkdtempSync(join(tmpdir(), 'nango-cli-tls-'));

function writeTemp(name: string, content: string): string {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
}

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('loadCliTlsOptions', () => {
    it('should be disabled when nothing is set', () => {
        expect(loadCliTlsOptions({})).toBeUndefined();
    });

    it('should ignore unrelated env vars', () => {
        expect(loadCliTlsOptions({ NANGO_HOSTPORT: 'https://nango.example' })).toBeUndefined();
    });

    it('should read a combined PEM that contains cert and key', () => {
        const combined = `${CERT_PEM}\n${KEY_PEM}\n`;
        const res = loadCliTlsOptions({ NANGO_CLI_TLS_CERT: writeTemp('combined.pem', combined) });
        expect(res).toEqual({ cert: CERT_PEM, key: KEY_PEM });
    });

    it('should read split cert and key paths', () => {
        const res = loadCliTlsOptions({
            NANGO_CLI_TLS_CERT: writeTemp('tls.crt', CERT_PEM),
            NANGO_CLI_TLS_KEY: writeTemp('tls.key', KEY_PEM),
            NANGO_CLI_TLS_CA: writeTemp('ca.crt', CA_PEM)
        });
        expect(res).toEqual({ cert: CERT_PEM, key: KEY_PEM, ca: CA_PEM });
    });

    it('should prefer a dedicated key file over a key bundled in the cert file', () => {
        const otherKey = '-----BEGIN PRIVATE KEY-----\nother-key\n-----END PRIVATE KEY-----';
        const res = loadCliTlsOptions({
            NANGO_CLI_TLS_CERT: writeTemp('bundled.pem', `${CERT_PEM}\n${KEY_PEM}\n`),
            NANGO_CLI_TLS_KEY: writeTemp('override.key', otherKey)
        });
        expect(res).toEqual({ cert: CERT_PEM, key: otherKey });
    });

    it('should join a certificate chain from the cert file', () => {
        const intermediate = '-----BEGIN CERTIFICATE-----\nintermediate\n-----END CERTIFICATE-----';
        const res = loadCliTlsOptions({
            NANGO_CLI_TLS_CERT: writeTemp('chain.pem', `${CERT_PEM}\n${intermediate}\n${KEY_PEM}\n`)
        });
        expect(res).toEqual({ cert: `${CERT_PEM}\n${intermediate}`, key: KEY_PEM });
    });

    it('should accept surrounding whitespace in files', () => {
        const res = loadCliTlsOptions({
            NANGO_CLI_TLS_CERT: writeTemp('padded.crt', `\n\n${CERT_PEM}\n\n`),
            NANGO_CLI_TLS_KEY: writeTemp('padded.key', `\n${KEY_PEM}\n`)
        });
        expect(res).toEqual({ cert: CERT_PEM, key: KEY_PEM });
    });

    it('should include the passphrase', () => {
        const res = loadCliTlsOptions({
            NANGO_CLI_TLS_CERT: writeTemp('pass.crt', CERT_PEM),
            NANGO_CLI_TLS_KEY: writeTemp('pass.key', KEY_PEM),
            NANGO_CLI_TLS_KEY_PASSPHRASE: 'hunter2'
        });
        expect(res?.passphrase).toBe('hunter2');
    });

    it('should omit an empty passphrase', () => {
        const res = loadCliTlsOptions({
            NANGO_CLI_TLS_CERT: writeTemp('empty-pass.crt', CERT_PEM),
            NANGO_CLI_TLS_KEY: writeTemp('empty-pass.key', KEY_PEM),
            NANGO_CLI_TLS_KEY_PASSPHRASE: ''
        });
        expect(res).not.toHaveProperty('passphrase');
    });

    it('should preserve whitespace in the passphrase', () => {
        const res = loadCliTlsOptions({
            NANGO_CLI_TLS_CERT: writeTemp('ws-pass.crt', CERT_PEM),
            NANGO_CLI_TLS_KEY: writeTemp('ws-pass.key', KEY_PEM),
            NANGO_CLI_TLS_KEY_PASSPHRASE: ' hunter2 '
        });
        expect(res?.passphrase).toBe(' hunter2 ');
    });

    it('should allow a CA on its own', () => {
        const res = loadCliTlsOptions({ NANGO_CLI_TLS_CA: writeTemp('ca-only.crt', CA_PEM) });
        expect(res).toEqual({ ca: CA_PEM });
    });

    it('should throw when a file is missing', () => {
        expect(() => {
            loadCliTlsOptions({ NANGO_CLI_TLS_CERT: join(dir, 'does-not-exist.crt') });
        }).toThrowError(/Unable to read/);
    });

    it('should throw when a file is unreadable', () => {
        expect(() => {
            loadCliTlsOptions({ NANGO_CLI_TLS_CA: join(dir, 'missing-ca.crt') });
        }).toThrowError(/Unable to read/);
    });

    it('should throw when a file holds no PEM block', () => {
        expect(() => {
            loadCliTlsOptions({ NANGO_CLI_TLS_CERT: writeTemp('junk.crt', 'nope') });
        }).toThrowError(/does not contain a PEM block/);
    });

    it('should throw when the cert file has no certificate', () => {
        expect(() => {
            loadCliTlsOptions({ NANGO_CLI_TLS_CERT: writeTemp('key-only.pem', KEY_PEM) });
        }).toThrowError(/does not contain a certificate PEM block/);
    });

    it('should throw when the cert is set without a key', () => {
        expect(() => {
            loadCliTlsOptions({ NANGO_CLI_TLS_CERT: writeTemp('cert-only.crt', CERT_PEM) });
        }).toThrowError(/must be set together/);
    });

    it('should throw when the key is set without the cert', () => {
        expect(() => {
            loadCliTlsOptions({ NANGO_CLI_TLS_KEY: writeTemp('key-only.key', KEY_PEM) });
        }).toThrowError(/must be set together/);
    });

    it('should throw when the key file has no private key', () => {
        expect(() => {
            loadCliTlsOptions({
                NANGO_CLI_TLS_CERT: writeTemp('has-cert.crt', CERT_PEM),
                NANGO_CLI_TLS_KEY: writeTemp('ca-as-key.key', CA_PEM)
            });
        }).toThrowError(/does not contain a private key PEM block/);
    });
});

describe('assertUsable', () => {
    it('should accept a matching cert/key pair', () => {
        expect(() => {
            assertUsable({ cert: MATCHING_CERT, key: MATCHING_KEY });
        }).not.toThrow();
    });

    it('should reject a mismatched cert/key pair', () => {
        expect(() => {
            assertUsable({ cert: MATCHING_CERT, key: OTHER_KEY });
        }).toThrowError(/assets were rejected/);
    });

    it('should reject an unreadable key', () => {
        expect(() => {
            assertUsable({ key: KEY_PEM });
        }).toThrowError(/assets were rejected/);
    });
});

describe('lazy TLS load', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('throws the same cached error on later use, not at import', async () => {
        vi.stubEnv('NANGO_CLI_TLS_CERT', join(dir, 'lazy-missing.crt'));
        const { getCliHttpsAgent } = await import('./tls.js');

        let first: unknown;
        try {
            getCliHttpsAgent();
        } catch (err) {
            first = err;
        }
        let second: unknown;
        try {
            getCliHttpsAgent();
        } catch (err) {
            second = err;
        }

        expect(first).toBeInstanceOf(Error);
        expect((first as Error).message).toMatch(/Unable to read/);
        expect(second).toBe(first);
    });
});
