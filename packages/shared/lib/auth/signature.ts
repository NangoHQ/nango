import crypto from 'node:crypto';

import { Err, Ok } from '@nangohq/utils';

import { AuthCredentialsError } from '../utils/error.js';

import type { ProviderSignature, SignatureCredentials } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Create Signature credentials
 */
export function createCredentials({
    provider,
    username,
    password
}: {
    username: SignatureCredentials['username'];
    password: SignatureCredentials['password'];
    provider: ProviderSignature;
}): Result<SignatureCredentials, AuthCredentialsError> {
    try {
        if (provider.signature.protocol !== 'WSSE') {
            return Err(new AuthCredentialsError('unsupported_signature_protocol'));
        }

        const token = generateWSSE(username, password);
        const expiresAt = new Date(Date.now() + provider.token.expires_in_ms);
        const credentials: SignatureCredentials = {
            type: 'SIGNATURE',
            username,
            password,
            token,
            expires_at: expiresAt
        };

        return Ok(credentials);
    } catch (err) {
        if (err instanceof AuthCredentialsError) {
            return Err(err);
        }

        return Err(new AuthCredentialsError('signature_token_generation_error', { cause: err }));
    }
}

function generateWSSE(username: string, password: string): string {
    try {
        const nonce = crypto.randomBytes(16).toString('hex');

        const timestamp = new Date().toISOString();

        const sha1Hash = crypto
            .createHash('sha1')
            .update(nonce + timestamp + password)
            .digest('hex');

        const passwordDigest = Buffer.from(sha1Hash).toString('base64');

        const token = `UsernameToken Username="${username}", PasswordDigest="${passwordDigest}", Nonce="${nonce}", Created="${timestamp}"`;

        return token;
    } catch (err) {
        throw new AuthCredentialsError('wsse_token_generation_error', { cause: err });
    }
}
