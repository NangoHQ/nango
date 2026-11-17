import { constants, createHash, verify, X509Certificate } from 'node:crypto';
import http from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import providerClient from './provider.client.js';

import type { Config as ProviderConfig } from '../models/index.js';
import type * as OutboundPolicyModule from '../services/proxy/outbound-policy.js';
import type { DBConnectionDecrypted, ProviderOAuth2 } from '@nangohq/types';
import type { AddressInfo } from 'node:net';

// Loopback is always blocked by the real egress policy; neutralise it so the test token endpoint is reachable.
vi.mock('../services/proxy/outbound-policy.js', async (importOriginal) => {
    const actual = await importOriginal<typeof OutboundPolicyModule>();
    return {
        ...actual,
        assertSafeOAuthUrl: vi.fn((url: string) => Promise.resolve(new URL(url))),
        getOAuthAxiosRequestConfig: vi.fn(() => ({}))
    };
});

async function withTokenServer(fn: (tokenUrl: string, bodies: string[]) => Promise<void>): Promise<void> {
    const bodies: string[] = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            bodies.push(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ access_token: 'token', token_type: 'Bearer', expires_in: 3599 }));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
        await fn(`http://127.0.0.1:${port}/tenant/oauth2/v2.0/token`, bodies);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

const config = {
    id: 1,
    unique_key: 'microsoft-admin',
    provider: 'microsoft-admin',
    oauth_client_id: 'client-id',
    oauth_client_secret: 'client-secret',
    oauth_scopes: 'https://graph.microsoft.com/.default',
    environment_id: 1,
    created_at: new Date(),
    updated_at: new Date(),
    missing_fields: []
} as unknown as ProviderConfig;

describe('microsoft-admin client_credentials', () => {
    // microsoft-admin-cert shares this request; microsoft-admin must keep sending exactly the client secret flow.
    it('sends the client secret request unchanged on creation and refresh', async () => {
        await withTokenServer(async (tokenUrl, bodies) => {
            await providerClient.getToken(config, { auth_mode: 'OAUTH2' } as ProviderOAuth2, tokenUrl, 'unused', 'https://cb', '');
            const connection = { credentials: { type: 'OAUTH2', access_token: 'old', raw: {} }, connection_config: {} } as unknown as DBConnectionDecrypted;
            await providerClient.refreshToken({ auth_mode: 'OAUTH2', token_url: tokenUrl } as ProviderOAuth2, config, connection);
            const expected = 'client_id=client-id&client_secret=client-secret&grant_type=client_credentials&scope=https%3A%2F%2Fgraph.microsoft.com%2F.default';
            expect(bodies).toEqual([expected, expected]);
        });
    });

    // Microsoft rejects a double-encoded scope with AADSTS1002012 ("scope https%3A%2F%2Fgraph.microsoft.com%2F.default is not valid").
    it('sends the scope form-encoded exactly once on token creation', async () => {
        await withTokenServer(async (tokenUrl, bodies) => {
            await providerClient.getToken(config, { auth_mode: 'OAUTH2' } as ProviderOAuth2, tokenUrl, 'unused', 'https://cb', '');
            expect(new URLSearchParams(bodies[0]).get('scope')).toBe('https://graph.microsoft.com/.default');
        });
    });

    it('sends the scope form-encoded exactly once on refresh', async () => {
        await withTokenServer(async (tokenUrl, bodies) => {
            const provider = { auth_mode: 'OAUTH2', token_url: tokenUrl } as ProviderOAuth2;
            const connection = {
                credentials: { type: 'OAUTH2', access_token: 'old', raw: {} },
                connection_config: {}
            } as unknown as DBConnectionDecrypted;
            await providerClient.refreshToken(provider, config, connection);
            expect(new URLSearchParams(bodies[0]).get('scope')).toBe('https://graph.microsoft.com/.default');
        });
    });
});

// Self-signed RSA pair generated once for these tests only; not used anywhere else.
const TEST_PRIVATE_KEY = [
    '-----BEGIN PRIVATE KEY-----',
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDaSknptuFjvDZx',
    'fiBiDRG86Y+JoG0lIUa1SZizXghM18sMOAcI4IxBAOZN2AAmy5uLoV7++g+4S/bU',
    '4jGeFVzQPE9ped6y4bFF4jezZBSWZMWR7b2o9SDAX3ydr3wy2TIFIvib8gNTRWGg',
    '05QEr/fmUvbGMWvBGGBDfj5z6uZCVlmEhLD9LlvZDRL1hplTrkyKizh72f/v2Yfx',
    'GT9h5GORQHmTYNeRai98t/o7+Sq5y2p6hJng2JubiE3ks6WY/BvwPqzIAlKskIHa',
    '81V+Na2Z9MwQhTVynhRNHIYnK3VAETuT4t1JlsR2JX6aw7wXPgzNJwzDsDRrTBLh',
    'Fev+IzM9AgMBAAECggEACMeHx9PC++ZpetC7pQXpNTkK51pMRCaITVPw8CHeNpel',
    'QyVhDw0s8ZOuL5T6PeqJeSkGhOhyHROdEVHUSgs06OvMC9jKyVSvcw6WoUCWCA3J',
    '2Rp/5XLlHCea/6KRCGCDlQD45m4U49KnYGGyEyrapGj+I4Qq/8tRr9U81h+tSXSp',
    'mQBp8SflJ0mY9RCRJkGh0JyX65J8bUBNLwFOLfdEsnxcyZBt7rfB2znDgdn9wHUm',
    '5Q0+Cp9AwrA8zm0h5RVopDhZol52FUGKG8EWr0v0WJKJeA7P4FFHiEwC+bXMWAEr',
    'DIRPkkWZoYcamN0CCC97kdN6FpMf1Rw1ncQQ27TTIQKBgQDy1VsW84tE54syhUaU',
    'GG3KZYnocoxSxIz/4s0KDho4+D3eJCPPnco/tv04hC+Zt+8bbxeESP3l8VTFbzeg',
    'R3oCdSkKwv0ejoFZ5RZ7tqW8odviHetdD1LSYUHpW4Ie3mpA/6cA5r1fT64704NT',
    'q2d+DDcBgvvU4AqDvAhkw3EB8QKBgQDmIELXzRScz0eL+WrxtfCFSyanQLzE4GD3',
    'S/CBm3SRq0eaSthEK3fdvdWvi3NsrAurqft1JJsCI4IS3AUYSPK1PMPFuTC8S4ym',
    '89pAIDz8AZQDYnm8gED+RIoFw5LdScqNkqk+w4CV6OZCosWOt6xuFyE6mF6r09XT',
    '6QNd6M26DQKBgHh6ODY74LXv9tS64NhrAlWvaOuFoW8TCy2NVdMOSh5Hs1I6NfY0',
    'v/o6jIl0s7UdV6kRxeYg3K8vu7I0yrFfpP4BKLqpITH+29hA25XHeZUL7O7Tj0ld',
    'Z+buz+e6OeWczbSv4iiFUiEuhDA0cWyalr8nykaauNzVxwGy0atEeBXRAoGBAJTD',
    'ejKDMrYEER5diFLk6K1iXYR1hxJGcqirALjoQ7z/WnRVueSnrP89fuvSXDV+KrU4',
    'V4Psu//v8GA8t1ZxoeSjeXNSOj0fIbezn/0gWgwXARYHDOdciadVq1v6h/BhiX1n',
    't90JCRDf1Cpziv6todwxO5vjcB/n+yzYTwLgQk3pAoGAZ+DbBawzjfBrsPhpz77t',
    'TtaHhmObM1apxwG3CUi/GBh5oDbJuuaLdA53BoKFurtW6wYl+gdaw2Tx+FjwmDw/',
    'dJHNImw0nbeOyk3RxMenWgEtx8JeGArILpUjkI+m52iqLNTgW6UZs/z5aVJV1jKR',
    'Zv+aj6Pz3/JlnJ+Hp4hyahs=',
    '-----END PRIVATE KEY-----'
].join('\n');
const TEST_CERTIFICATE = [
    '-----BEGIN CERTIFICATE-----',
    'MIIC7DCCAdSgAwIBAgIUNhf9N6gUD5jGREgskKnIv3FAD64wDQYJKoZIhvcNAQEL',
    'BQAwFTETMBEGA1UEAwwKbmFuZ28tdGVzdDAgFw0yNjExMTcxNjA2MTVaGA8yMTI2',
    'MTAyNDE2MDYxNVowFTETMBEGA1UEAwwKbmFuZ28tdGVzdDCCASIwDQYJKoZIhvcN',
    'AQEBBQADggEPADCCAQoCggEBANpKSem24WO8NnF+IGINEbzpj4mgbSUhRrVJmLNe',
    'CEzXyww4BwjgjEEA5k3YACbLm4uhXv76D7hL9tTiMZ4VXNA8T2l53rLhsUXiN7Nk',
    'FJZkxZHtvaj1IMBffJ2vfDLZMgUi+JvyA1NFYaDTlASv9+ZS9sYxa8EYYEN+PnPq',
    '5kJWWYSEsP0uW9kNEvWGmVOuTIqLOHvZ/+/Zh/EZP2HkY5FAeZNg15FqL3y3+jv5',
    'KrnLanqEmeDYm5uITeSzpZj8G/A+rMgCUqyQgdrzVX41rZn0zBCFNXKeFE0chicr',
    'dUARO5Pi3UmWxHYlfprDvBc+DM0nDMOwNGtMEuEV6/4jMz0CAwEAAaMyMDAwHQYD',
    'VR0OBBYEFDSMpegS7Tybd4wuS2HwlAyhht/qMA8GA1UdEwEB/wQFMAMBAf8wDQYJ',
    'KoZIhvcNAQELBQADggEBAAjwHy53uq0Hty6kyZYtCbW4l+BBtHQlFzyMytp+1cDV',
    'rfoLgUy9EsugdeZU7AA53KOXgsBxuxdrPfSIqbKFaDs8voo7RxEyLYztfq1sjkgU',
    't5MlitvFftD1uKOl1sYQIblI8K5+p1gbeqvhx0SRDieZgSkqQf2h9vvj0APGzDov',
    'cOh25KG9JseMeEPTPE/KcJi9x6ck9O44o80pCSLbnAh6eXRL2Emmk/TUvyCrcKNq',
    'wifzv3lIRNfUzoQE1nvNF1RQ7PEPIwMb+FdPTTkD9Af5prAI83qBCwQmvJORZmCa',
    'kiGReFxyw94ESa7WpLikIiwYwKF0pq3ciKYkkCsZQEc=',
    '-----END CERTIFICATE-----'
].join('\n');

describe('microsoft-admin-cert client_credentials', () => {
    const certConfig = {
        ...config,
        unique_key: 'microsoft-admin-cert',
        provider: 'microsoft-admin-cert',
        oauth_client_secret: TEST_PRIVATE_KEY,
        custom: { certificate: TEST_CERTIFICATE }
    } as unknown as ProviderConfig;

    function expectCertificateAssertion(body: string, tokenUrl: string) {
        const params = new URLSearchParams(body);
        expect(params.get('client_secret')).toBeNull();
        expect(params.get('client_id')).toBe('client-id');
        expect(params.get('grant_type')).toBe('client_credentials');
        expect(params.get('scope')).toBe('https://graph.microsoft.com/.default');
        expect(params.get('client_assertion_type')).toBe('urn:ietf:params:oauth:client-assertion-type:jwt-bearer');

        const [header, payload, signature] = params.get('client_assertion')!.split('.') as [string, string, string];
        const certificate = new X509Certificate(TEST_CERTIFICATE);
        expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
            alg: 'PS256',
            typ: 'JWT',
            'x5t#S256': createHash('sha256').update(certificate.raw).digest('base64url')
        });
        expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({ aud: tokenUrl, iss: 'client-id', sub: 'client-id' });
        const valid = verify(
            'sha256',
            Buffer.from(`${header}.${payload}`),
            { key: certificate.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST },
            Buffer.from(signature, 'base64url')
        );
        expect(valid).toBe(true);
    }

    it('signs a PS256 client assertion with the certificate thumbprint instead of sending a secret', async () => {
        await withTokenServer(async (tokenUrl, bodies) => {
            await providerClient.getToken(certConfig, { auth_mode: 'OAUTH2' } as ProviderOAuth2, tokenUrl, 'unused', 'https://cb', '');
            expectCertificateAssertion(bodies[0]!, tokenUrl);
        });
    });

    it('signs a fresh assertion on refresh', async () => {
        await withTokenServer(async (tokenUrl, bodies) => {
            const provider = { auth_mode: 'OAUTH2', token_url: tokenUrl } as ProviderOAuth2;
            const connection = {
                credentials: { type: 'OAUTH2', access_token: 'old', raw: {} },
                connection_config: {}
            } as unknown as DBConnectionDecrypted;
            await providerClient.refreshToken(provider, certConfig, connection);
            expectCertificateAssertion(bodies[0]!, tokenUrl);
        });
    });

    it('fails clearly when the integration has no certificate', async () => {
        const noCertificate = { ...certConfig, custom: {} } as unknown as ProviderConfig;
        await expect(
            providerClient.getToken(
                noCertificate,
                { auth_mode: 'OAUTH2' } as ProviderOAuth2,
                'https://login.microsoftonline.com/t/oauth2/v2.0/token',
                '',
                '',
                ''
            )
        ).rejects.toThrow('The integration needs both the private key and the certificate');
    });
});
