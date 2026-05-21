import { Encryption } from '@nangohq/utils';

import type { DBAPISecret } from '@nangohq/types';

const encryption = new Encryption(process.env['NANGO_ENCRYPTION_KEY'] || '');

export function shouldEncrypt(): boolean {
    return Boolean(encryption.getKey());
}

export function encryptSync(value: string): [string, string, string] {
    return encryption.encryptSync(value);
}

export function decryptSync(value: string, iv: string, tag: string): string {
    return encryption.decryptSync(value, iv, tag);
}

export function decryptApiSecret<T extends Pick<DBAPISecret, 'secret' | 'iv' | 'tag'>>(secret: T): T & { iv: ''; tag: '' } {
    if (!shouldEncrypt() || !secret.iv || !secret.tag) {
        return {
            ...secret,
            iv: '',
            tag: ''
        };
    }

    return {
        ...secret,
        secret: decryptSync(secret.secret, secret.iv, secret.tag),
        iv: '',
        tag: ''
    };
}
