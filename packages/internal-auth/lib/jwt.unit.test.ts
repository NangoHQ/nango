import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    INTERNAL_SERVICE_ISSUER_SERVER,
    taskSubject
} from './constants.js';
import { keyRegistryFromPublicKeys, mint, signerForService } from './jwt.js';
import { verifyInternalServiceCredential } from './verify.js';

function ed25519Material(): { pem: string; raw: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
        .subarray(12)
        .toString('base64url');
    return { pem, raw };
}

describe('signerForService', () => {
    it('reads the private key and key id for the named service', () => {
        const jobs = ed25519Material();
        const server = ed25519Material();
        const envs = {
            NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY: jobs.pem,
            NANGO_INTERNAL_AUTH_JOBS_KEY_ID: 'jobs-2026-09',
            NANGO_INTERNAL_AUTH_SERVER_PRIVATE_KEY: server.pem,
            NANGO_INTERNAL_AUTH_SERVER_KEY_ID: 'server-2026-09'
        };

        expect(signerForService('jobs', envs)).toEqual({ iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: jobs.pem.trim() });
        expect(signerForService('server', envs)).toEqual({ iss: INTERNAL_SERVICE_ISSUER_SERVER, kid: 'server-2026-09', privateKey: server.pem.trim() });
    });

    it('returns null when the private key or key id is missing', () => {
        expect(signerForService('jobs', { NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY: 'pem' })).toBeNull();
        expect(signerForService('server', { NANGO_INTERNAL_AUTH_SERVER_KEY_ID: 'server-2026-09' })).toBeNull();
    });
});

describe('unified internal auth JWT', () => {
    it('mints and verifies a service token', async () => {
        const jobs = ed25519Material();
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: jobs.pem },
            { sub: INTERNAL_SERVICE_ISSUER_JOBS, aud: INTERNAL_SERVICE_AUDIENCE_RUNNER, ttlSecs: 300 }
        );
        const header = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')) as { alg: string; kid: string; typ: string };
        expect(header).toEqual({ alg: 'EdDSA', kid: 'jobs-2026-09', typ: 'JWT' });

        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: jobs.raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_RUNNER, { registry });
        expect(auth).toEqual({
            kind: 'jwt',
            subject: INTERNAL_SERVICE_ISSUER_JOBS,
            sub: INTERNAL_SERVICE_ISSUER_JOBS,
            issuer: INTERNAL_SERVICE_ISSUER_JOBS,
            audience: INTERNAL_SERVICE_AUDIENCE_RUNNER
        });
    });

    it('selects the key by kid', async () => {
        const current = ed25519Material();
        const next = ed25519Material();
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-next', privateKey: next.pem },
            { sub: taskSubject('task-1'), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60 }
        );
        const registry = keyRegistryFromPublicKeys(
            [
                { kid: 'jobs-2026-09', publicKey: current.raw },
                { kid: 'jobs-next', publicKey: next.raw }
            ],
            INTERNAL_SERVICE_ISSUER_JOBS
        );
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry });
        expect(auth).toMatchObject({ kind: 'jwt', sub: 'task:task-1', issuer: INTERNAL_SERVICE_ISSUER_JOBS });
    });

    it('rejects a token signed by a different key than the kid entry', async () => {
        const current = ed25519Material();
        const next = ed25519Material();
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: current.pem },
            { sub: INTERNAL_SERVICE_ISSUER_JOBS, aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: 60 }
        );
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: next.raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        expect(await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry })).toBeNull();
    });

    it('rejects a token whose issuer does not match the kid entry', async () => {
        const jobs = ed25519Material();
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'shared-kid', privateKey: jobs.pem },
            { sub: INTERNAL_SERVICE_ISSUER_JOBS, aud: INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, ttlSecs: 60 }
        );
        const registry = keyRegistryFromPublicKeys([{ kid: 'shared-kid', publicKey: jobs.raw }], INTERNAL_SERVICE_ISSUER_SERVER);
        expect(await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, { registry })).toBeNull();
    });

    it('rejects the wrong audience and an expired token', async () => {
        const jobs = ed25519Material();
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: jobs.raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: jobs.pem },
            { sub: INTERNAL_SERVICE_ISSUER_JOBS, aud: INTERNAL_SERVICE_AUDIENCE_RUNNER, ttlSecs: 60 }
        );
        expect(await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_JOBS, { registry })).toBeNull();

        const expired = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: jobs.pem },
            { sub: INTERNAL_SERVICE_ISSUER_JOBS, aud: INTERNAL_SERVICE_AUDIENCE_RUNNER, ttlSecs: -1 }
        );
        expect(await verifyInternalServiceCredential(expired, INTERNAL_SERVICE_AUDIENCE_RUNNER, { registry })).toBeNull();
    });

    it('does not fall through from a kid token to the static secret', async () => {
        const jobs = ed25519Material();
        const token = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: jobs.pem },
            { sub: INTERNAL_SERVICE_ISSUER_JOBS, aud: INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, ttlSecs: 60 }
        );
        const auth = await verifyInternalServiceCredential(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, {
            staticToken: token,
            registry: {}
        });
        expect(auth).toBeNull();
    });
});
