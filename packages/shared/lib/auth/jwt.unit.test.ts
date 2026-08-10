import { generateKeyPairSync } from 'node:crypto';

import jsonwebtoken from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { getProvider } from '@nangohq/providers';

import { createCredentials, decode, fetchJwtToken } from './jwt.js';

import type { ProviderJwt, ProviderTwoStep } from '@nangohq/types';

describe('fetchJwtToken', () => {
    it('should sign successfully with a single-line EC/PKCS8 private key (e.g. Apple App Store format)', () => {
        const { privateKey } = generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        const singleLineKey = privateKey.replace(/\n/g, '');

        const res = fetchJwtToken({
            privateKey: singleLineKey,
            payload: { iss: 'test-issuer', iat: Math.floor(Date.now() / 1000) },
            options: { algorithm: 'ES256', header: { kid: 'test-key-id' } }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(typeof res.value.jwtToken).toBe('string');
        }
    });

    it('should still sign successfully with a single-line RSA (PKCS1) private key', () => {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
        });
        const singleLineKey = privateKey.replace(/\n/g, '');

        const res = fetchJwtToken({
            privateKey: singleLineKey,
            payload: { iss: 'test-issuer', iat: Math.floor(Date.now() / 1000) },
            options: { algorithm: 'RS256' }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(typeof res.value.jwtToken).toBe('string');
        }
    });

    it('should keep signing correctly with an already well-formatted, multi-line RSA (PKCS1) private key (e.g. GitHub App)', () => {
        // GitHub App keys are downloaded as standard 64-char-wrapped PKCS1 PEMs and passed through
        // unchanged by githubApp.ts — this must keep working exactly as before this function started
        // reformatting every key via formatPem instead of only fixing up missing RSA line breaks.
        const { privateKey, publicKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
        });

        const res = fetchJwtToken({
            privateKey,
            payload: { iss: 'test-app-id', iat: Math.floor(Date.now() / 1000) },
            options: { algorithm: 'RS256' }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            const verified = jsonwebtoken.verify(res.value.jwtToken, publicKey, { algorithms: ['RS256'] }) as Record<string, unknown>;
            expect(verified['iss']).toBe('test-app-id');
        }
    });

    it('should keep signing correctly with an already well-formatted, multi-line EC/PKCS8 private key', () => {
        const { privateKey, publicKey } = generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        const res = fetchJwtToken({
            privateKey,
            payload: { iss: 'test-issuer', iat: Math.floor(Date.now() / 1000) },
            options: { algorithm: 'ES256', header: { kid: 'test-key-id' } }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            const verified = jsonwebtoken.verify(res.value.jwtToken, publicKey, { algorithms: ['ES256'] }) as Record<string, unknown>;
            expect(verified['iss']).toBe('test-issuer');
        }
    });

    it('should return an error instead of throwing for a garbage private key', () => {
        const res = fetchJwtToken({
            privateKey: 'not-a-real-key',
            payload: { iss: 'test' },
            options: { algorithm: 'ES256' }
        });

        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.type).toBe('failed_to_sign');
        }
    });
});

describe('createCredentials', () => {
    const { privateKey } = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const appleAppStoreProvider: ProviderJwt = {
        display_name: 'Apple App Store',
        docs: 'https://nango.dev/docs/api-integrations/apple-app-store',
        auth_mode: 'JWT',
        signature: { protocol: 'EC' },
        token: {
            signing_key: '${credentials.privateKey}',
            expires_in_ms: 900_000,
            header: {
                alg: 'ES256',
                kid: '${credentials.privateKeyId}',
                typ: 'JWT'
            },
            payload: {
                iss: '${credentials.issuerId}',
                aud: 'appstoreconnect-v1',
                scope: ['${connectionConfig.scope}']
            }
        }
    };

    it('includes scope as an array in the payload when provided via connectionConfig (App Store Connect requires an array)', () => {
        const res = createCredentials({
            config: 'apple-app-store',
            provider: appleAppStoreProvider,
            dynamicCredentials: { privateKey, privateKeyId: 'test-key-id', issuerId: 'test-issuer' },
            connectionConfig: { scope: 'GET /v1/apps' }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value.token).toBeTruthy();
            const decoded = decode(res.value.token || '');
            expect(decoded?.['scope']).toEqual(['GET /v1/apps']);
            expect(decoded?.['iss']).toBe('test-issuer');
            expect(decoded?.['aud']).toBe('appstoreconnect-v1');
        }
    });

    it('splits a comma-separated scope into multiple array entries', () => {
        const res = createCredentials({
            config: 'apple-app-store',
            provider: appleAppStoreProvider,
            dynamicCredentials: { privateKey, privateKeyId: 'test-key-id', issuerId: 'test-issuer' },
            connectionConfig: { scope: 'GET /v1/apps, GET /v1/builds' }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            const decoded = decode(res.value.token || '');
            expect(decoded?.['scope']).toEqual(['GET /v1/apps', 'GET /v1/builds']);
        }
    });

    it('omits scope from the payload instead of sending the unresolved placeholder when not provided', () => {
        const res = createCredentials({
            config: 'apple-app-store',
            provider: appleAppStoreProvider,
            dynamicCredentials: { privateKey, privateKeyId: 'test-key-id', issuerId: 'test-issuer' }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value.token).toBeTruthy();
            const decoded = decode(res.value.token || '');
            expect(decoded).not.toHaveProperty('scope');
        }
    });

    // Regression test: two-step providers with a `signature` block (e.g. salesforce-jwt) reference
    // connectionConfig in their JWT payload/token_url — e.g. `aud: ${connectionConfig.authorizationUrl}`.
    // getTwoStepCredentials (connection.service.ts) calls createCredentials for these; make sure that
    // path — both via the dedicated `connectionConfig` param and the legacy dynamicCredentials-nested
    // form — still resolves correctly instead of silently dropping a required claim.
    const salesforceJwtProvider: ProviderTwoStep = {
        display_name: 'Salesforce (JWT)',
        docs: 'https://nango.dev/docs/api-integrations/salesforce-jwt',
        auth_mode: 'TWO_STEP',
        signature: { protocol: 'RSA' },
        token: {
            signing_key: '${credentials.privateKey}',
            expires_in_ms: 3_600_000,
            header: { alg: 'RS256', typ: 'JWT' },
            payload: {
                iss: '${credentials.clientId}',
                aud: 'https://${connectionConfig.authorizationUrl}',
                sub: '${credentials.username}'
            }
        },
        token_response: { token: 'access_token' }
    };

    const { privateKey: rsaPrivateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
    });

    it('resolves connectionConfig references in a two-step provider payload (e.g. salesforce-jwt aud) via the dedicated param', () => {
        const res = createCredentials({
            config: 'salesforce-jwt',
            provider: salesforceJwtProvider,
            dynamicCredentials: { privateKey: rsaPrivateKey, clientId: 'test-client-id', username: 'test@example.com' },
            connectionConfig: { authorizationUrl: 'login.salesforce.com' }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            const decoded = decode(res.value.token || '');
            expect(decoded?.['aud']).toBe('https://login.salesforce.com');
        }
    });

    it('still resolves connectionConfig when nested inside dynamicCredentials (legacy call pattern)', () => {
        const res = createCredentials({
            config: 'salesforce-jwt',
            provider: salesforceJwtProvider,
            dynamicCredentials: {
                privateKey: rsaPrivateKey,
                clientId: 'test-client-id',
                username: 'test@example.com',
                connectionConfig: { authorizationUrl: 'login.salesforce.com' }
            }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            const decoded = decode(res.value.token || '');
            expect(decoded?.['aud']).toBe('https://login.salesforce.com');
        }
    });

    it('signs ServiceNow assertions for the configured user and generates a fresh JWT ID for every exchange', () => {
        const serviceNowJwtProvider = getProvider('servicenow-jwt') as ProviderTwoStep;
        expect(serviceNowJwtProvider).toBeTruthy();

        const dynamicCredentials = {
            privateKey: rsaPrivateKey,
            clientId: 'servicenow-client-id',
            keyId: 'servicenow-key-id',
            userIdentifier: 'nango_integration'
        };

        const first = createCredentials({ config: 'servicenow-jwt', provider: serviceNowJwtProvider, dynamicCredentials });
        const second = createCredentials({ config: 'servicenow-jwt', provider: serviceNowJwtProvider, dynamicCredentials });

        expect(first.isOk()).toBe(true);
        expect(second.isOk()).toBe(true);

        if (first.isOk() && second.isOk()) {
            const firstToken = jsonwebtoken.decode(first.value.token || '', { complete: true });
            const firstPayload = firstToken?.payload as Record<string, unknown>;
            const secondPayload = decode(second.value.token || '');

            expect(firstToken?.header).toMatchObject({ alg: 'RS256', typ: 'JWT', kid: 'servicenow-key-id' });
            expect(firstPayload).toMatchObject({
                iss: 'servicenow-client-id',
                aud: 'servicenow-client-id',
                sub: 'nango_integration'
            });
            expect(firstPayload['jti']).toEqual(expect.any(String));
            expect(firstPayload['jti']).not.toBe(secondPayload?.['jti']);
            expect(Number(firstPayload['exp']) - Number(firstPayload['iat'])).toBe(300);
        }
    });

    it('keeps google-service-account scope as a plain string, unaffected by array-scope handling', () => {
        const googleServiceAccountProvider = getProvider('google-service-account') as ProviderTwoStep;
        expect(googleServiceAccountProvider).toBeTruthy();

        const { privateKey: googlePrivateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
        });

        const res = createCredentials({
            config: 'google-service-account',
            provider: googleServiceAccountProvider,
            dynamicCredentials: {
                privateKey: googlePrivateKey,
                serviceAccountEmailAddress: 'test@project.iam.gserviceaccount.com',
                scopes: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar'
            }
        });

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            const decoded = decode(res.value.token || '');
            expect(decoded?.['scope']).toBe('https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar');
            expect(decoded?.['iss']).toBe('test@project.iam.gserviceaccount.com');
        }
    });
});
