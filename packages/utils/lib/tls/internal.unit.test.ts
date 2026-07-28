import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { assertUsable, loadInternalTlsOptions } from './internal.js';

const CERT_PEM = '-----BEGIN CERTIFICATE-----\nnot-a-real-cert\n-----END CERTIFICATE-----\n';
const KEY_PEM = '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n';
const CA_PEM = '-----BEGIN CERTIFICATE-----\nnot-a-real-ca\n-----END CERTIFICATE-----\n';

const dir = mkdtempSync(join(tmpdir(), 'nango-tls-'));

function writeTemp(name: string, content: string): string {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
}

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('loadInternalTlsOptions', () => {
    it('should be disabled when nothing is set', () => {
        expect(loadInternalTlsOptions({})).toBeUndefined();
    });

    it('should ignore unrelated env vars', () => {
        expect(loadInternalTlsOptions({ NANGO_DATABASE_URL: 'postgres://localhost' })).toBeUndefined();
    });

    it('should read raw PEM', () => {
        const res = loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CERT: CERT_PEM, NANGO_INTERNAL_TLS_KEY: KEY_PEM });
        expect(res).toEqual({ cert: CERT_PEM.trim(), key: KEY_PEM.trim() });
    });

    it('should read base64-encoded PEM', () => {
        const res = loadInternalTlsOptions({
            NANGO_INTERNAL_TLS_CERT: Buffer.from(CERT_PEM).toString('base64'),
            NANGO_INTERNAL_TLS_KEY: Buffer.from(KEY_PEM).toString('base64')
        });
        expect(res).toEqual({ cert: CERT_PEM.trim(), key: KEY_PEM.trim() });
    });

    it('should read from files', () => {
        const res = loadInternalTlsOptions({
            NANGO_INTERNAL_TLS_CERT_FILE: writeTemp('tls.crt', CERT_PEM),
            NANGO_INTERNAL_TLS_KEY_FILE: writeTemp('tls.key', KEY_PEM),
            NANGO_INTERNAL_TLS_CA_FILE: writeTemp('ca.crt', CA_PEM)
        });
        expect(res).toEqual({ cert: CERT_PEM.trim(), key: KEY_PEM.trim(), ca: CA_PEM.trim() });
    });

    it('should resolve raw, base64 and file forms to identical content', () => {
        const raw = loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CERT: CERT_PEM, NANGO_INTERNAL_TLS_KEY: KEY_PEM });
        const base64 = loadInternalTlsOptions({
            NANGO_INTERNAL_TLS_CERT: Buffer.from(CERT_PEM).toString('base64'),
            NANGO_INTERNAL_TLS_KEY: Buffer.from(KEY_PEM).toString('base64')
        });
        const file = loadInternalTlsOptions({
            NANGO_INTERNAL_TLS_CERT_FILE: writeTemp('same.crt', CERT_PEM),
            NANGO_INTERNAL_TLS_KEY_FILE: writeTemp('same.key', KEY_PEM)
        });
        expect(raw).toEqual(base64);
        expect(raw).toEqual(file);
    });

    it('should accept surrounding whitespace in any form', () => {
        const padded = `\n\n${CERT_PEM}\n\n`;
        const expected = { cert: CERT_PEM.trim(), key: KEY_PEM.trim() };

        expect(loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CERT: padded, NANGO_INTERNAL_TLS_KEY: KEY_PEM })).toEqual(expected);
        expect(loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CERT: Buffer.from(padded).toString('base64'), NANGO_INTERNAL_TLS_KEY: KEY_PEM })).toEqual(expected);
        expect(loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CERT_FILE: writeTemp('padded.crt', padded), NANGO_INTERNAL_TLS_KEY: KEY_PEM })).toEqual(expected);
    });

    it('should include the passphrase', () => {
        const res = loadInternalTlsOptions({
            NANGO_INTERNAL_TLS_CERT: CERT_PEM,
            NANGO_INTERNAL_TLS_KEY: KEY_PEM,
            NANGO_INTERNAL_TLS_KEY_PASSPHRASE: 'hunter2'
        });
        expect(res?.passphrase).toBe('hunter2');
    });

    it('should preserve whitespace in the passphrase', () => {
        const res = loadInternalTlsOptions({
            NANGO_INTERNAL_TLS_CERT: CERT_PEM,
            NANGO_INTERNAL_TLS_KEY: KEY_PEM,
            NANGO_INTERNAL_TLS_KEY_PASSPHRASE: ' hunter2 '
        });
        expect(res?.passphrase).toBe(' hunter2 ');
    });

    it('should allow a CA on its own', () => {
        const res = loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CA: CA_PEM });
        expect(res).toEqual({ ca: CA_PEM.trim() });
    });

    it('should throw when the inline and file forms are both set', () => {
        expect(() => {
            loadInternalTlsOptions({
                NANGO_INTERNAL_TLS_CERT: CERT_PEM,
                NANGO_INTERNAL_TLS_CERT_FILE: writeTemp('dupe.crt', CERT_PEM),
                NANGO_INTERNAL_TLS_KEY: KEY_PEM
            });
        }).toThrowError(/Provide only one/);
    });

    it('should throw when a file is unreadable', () => {
        expect(() => {
            loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CERT_FILE: join(dir, 'does-not-exist.crt'), NANGO_INTERNAL_TLS_KEY: KEY_PEM });
        }).toThrowError(/Unable to read/);
    });

    it('should throw when a file holds no PEM block', () => {
        expect(() => {
            loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CERT_FILE: writeTemp('junk.crt', 'nope'), NANGO_INTERNAL_TLS_KEY: KEY_PEM });
        }).toThrowError(/does not contain a PEM block/);
    });

    it('should throw when an inline value is neither PEM nor base64 PEM', () => {
        expect(() => {
            loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CERT: 'nope', NANGO_INTERNAL_TLS_KEY: KEY_PEM });
        }).toThrowError(/neither a PEM block nor base64-encoded PEM/);
    });

    it('should throw when the cert is set without the key', () => {
        expect(() => {
            loadInternalTlsOptions({ NANGO_INTERNAL_TLS_CERT: CERT_PEM });
        }).toThrowError(/must be set together/);
    });

    it('should throw when the key is set without the cert', () => {
        expect(() => {
            loadInternalTlsOptions({ NANGO_INTERNAL_TLS_KEY: KEY_PEM });
        }).toThrowError(/must be set together/);
    });
});

describe('assertUsable', () => {
    const passphrase = ' spaced secret ';
    const { privateKey } = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }
    });

    it('should accept an encrypted key with its passphrase', () => {
        expect(() => {
            assertUsable({ key: privateKey, passphrase });
        }).not.toThrow();
    });

    it('should reject an encrypted key whose passphrase has been trimmed', () => {
        expect(() => {
            assertUsable({ key: privateKey, passphrase: passphrase.trim() });
        }).toThrowError(/assets were rejected/);
    });

    it('should reject an unreadable key', () => {
        expect(() => {
            assertUsable({ key: KEY_PEM });
        }).toThrowError(/assets were rejected/);
    });
});
