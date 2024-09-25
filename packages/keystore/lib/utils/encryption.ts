import { Encryption } from '@nangohq/utils';
import { envs } from './env.js';

let encryption: Encryption | null = null;

export function getEncryption(): Encryption {
    if (!encryption) {
        const encryptionKey = envs.NANGO_ENCRYPTION_KEY;
        if (!encryptionKey) {
            throw new Error('NANGO_ENCRYPTION_KEY is not set');
        }
        encryption = new Encryption(encryptionKey);
    }
    return encryption;
}
