import crypto from 'crypto';
import type { CipherGCMTypes } from 'crypto';

export class Encryption {
    protected key: string;
    protected algo: CipherGCMTypes = 'aes-256-gcm';
    protected encoding: BufferEncoding = 'base64';
    private encryptionKeyByteLength = 32;

    constructor(key: string) {
        this.key = key;

        if (key && Buffer.from(key, this.encoding).byteLength !== this.encryptionKeyByteLength) {
            throw new Error('Encryption key must be base64-encoded and 256-bit long.');
        }
    }

    getKey() {
        return this.key;
    }

    public encrypt(str: string): [string, string, string] {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algo, Buffer.from(this.key, this.encoding), iv);
        let enc = cipher.update(str, 'utf8', this.encoding);
        enc += cipher.final(this.encoding);
        return [enc, iv.toString(this.encoding), cipher.getAuthTag().toString(this.encoding)];
    }

    public decrypt(enc: string, iv: string, authTag: string): string {
        const decipher = crypto.createDecipheriv(this.algo, Buffer.from(this.key, this.encoding), Buffer.from(iv, this.encoding));
        decipher.setAuthTag(Buffer.from(authTag, this.encoding));
        let str = decipher.update(enc, this.encoding, 'utf8');
        str += decipher.final('utf8');
        return str;
    }
}
