import { readFileSync } from 'node:fs';

import { getLogger } from '../logger.js';

const logger = getLogger('internalAuth');

export type EnvRecord = Record<string, string | undefined>;

export function isInternalAuthRequired(env: EnvRecord = process.env): boolean {
    return env['NANGO_INTERNAL_AUTH_REQUIRED']?.toLowerCase() === 'true';
}

/**
 * Control-plane / register-idle credential. Never throws: a missing or unreadable file is treated
 * as no credential so a default deploy stays a no-op.
 */
export function getInternalServiceCredential(env: EnvRecord = process.env): string | null {
    const filePath = env['NANGO_INTERNAL_AUTH_TOKEN_FILE']?.trim();
    if (filePath) {
        try {
            const fromFile = readFileSync(filePath, 'utf8').trim();
            if (fromFile) {
                return fromFile;
            }
        } catch (err) {
            logger.warning('Unable to read NANGO_INTERNAL_AUTH_TOKEN_FILE; treating as no credential', { path: filePath, error: err });
        }
    }

    const token = env['NANGO_INTERNAL_AUTH_TOKEN']?.trim();
    return token || null;
}

export function getInternalAuthSigningKey(env: EnvRecord = process.env): string | null {
    const key = env['NANGO_INTERNAL_AUTH_SIGNING_KEY']?.trim();
    return key || null;
}

export function getInternalAuthBearerHeader(token: string | null | undefined): Record<string, string> {
    if (!token) {
        return {};
    }
    return { Authorization: `Bearer ${token}` };
}
