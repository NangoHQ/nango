import crypto from 'crypto';
import { NangoError } from '../utils/error.js';

export function generateWsseSignature(username: string, password: string): string {
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
        throw new NangoError('wsse_token_generation_error', { message: err instanceof Error ? err.message : 'unknown error' });
    }
}
