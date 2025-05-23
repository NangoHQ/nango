import crypto from 'crypto';
import utils from 'node:util';

import { Encryption } from '@nangohq/utils';

import { envs } from './env.js';

const pbkdf2 = utils.promisify(crypto.pbkdf2);

let encryption: Encryption | null = null;

function getEncryptionKey(): string {
    const encryptionKey = envs.NANGO_ENCRYPTION_KEY;
    if (!encryptionKey) {
        throw new Error('NANGO_ENCRYPTION_KEY is not set');
    }
    return encryptionKey;
}

export function getEncryption(): Encryption {
    if (!encryption) {
        const encryptionKey = getEncryptionKey();
        encryption = new Encryption(encryptionKey);
    }
    return encryption;
}

export async function hashValue(val: string): Promise<string> {
    const encryptionKey = getEncryptionKey();
    return (await pbkdf2(val, encryptionKey, 310000, 32, 'sha256')).toString('base64');
}
