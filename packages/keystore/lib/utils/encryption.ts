import utils from 'node:util';
import crypto from 'crypto';
import { Encryption } from '@nangohq/utils';
import { envs } from './env.js';

const pbkdf2 = utils.promisify(crypto.pbkdf2);

let encryption: Encryption | null = null;

function getEncryptionKey(): string | undefined {
    return envs.NANGO_ENCRYPTION_KEY;
}

export function getEncryption(): Encryption {
    if (!encryption) {
        const encryptionKey = getEncryptionKey();
        if (!encryptionKey) {
            throw new Error('NANGO_ENCRYPTION_KEY is not set');
        }
        encryption = new Encryption(encryptionKey);
    }
    return encryption;
}

export async function hashValue(val: string): Promise<string> {
    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) {
        throw new Error('NANGO_ENCRYPTION_KEY is not set');
    }

    return (await pbkdf2(val, encryptionKey, 310000, 32, 'sha256')).toString('base64');
}
