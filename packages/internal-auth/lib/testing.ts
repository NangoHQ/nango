import { generateKeyPairSync } from 'node:crypto';

import { mint } from './core/mint.js';
import {
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_AUDIENCE_SERVER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    taskSubject
} from './nango/principals.js';

import type { TaskCapabilityResource } from './nango/principals.js';
import type { TaskCapabilityScope } from './nango/scopes.js';

export function ed25519TestMaterial(): { pem: string; raw: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
        .subarray(12)
        .toString('base64url');
    return { pem, raw };
}

const DEFAULT_AUDIENCES = [INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_PERSIST, INTERNAL_SERVICE_AUDIENCE_SERVER] as const;

export async function mintTaskCapabilityToken(args: {
    privateKey: string;
    kid?: string;
    taskId: string;
    res: TaskCapabilityResource;
    scopes: readonly TaskCapabilityScope[];
    ttlSecs?: number;
    aud?: string | readonly string[];
}): Promise<string> {
    return await mint(
        { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: args.kid ?? 'jobs-2026-09', privateKey: args.privateKey },
        {
            sub: taskSubject(args.taskId),
            aud: args.aud ?? DEFAULT_AUDIENCES,
            ttlSecs: args.ttlSecs ?? 60,
            res: args.res,
            scopes: args.scopes
        }
    );
}
