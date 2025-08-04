import crypto from 'crypto';

import type { CipherGCMTypes } from 'crypto';

export class Encryption {
    protected key: string;
    protected algorithm: { sync: CipherGCMTypes; async: 'AES-GCM' } = { sync: 'aes-256-gcm', async: 'AES-GCM' };
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

    public encryptSync(str: string): [string, string, string] {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algorithm.sync, Buffer.from(this.key, this.encoding), iv);
        let enc = cipher.update(str, 'utf8', this.encoding);
        enc += cipher.final(this.encoding);
        return [enc, iv.toString(this.encoding), cipher.getAuthTag().toString(this.encoding)];
    }

    public decryptSync(enc: string, iv: string, authTag: string): string {
        const decipher = crypto.createDecipheriv(this.algorithm.sync, Buffer.from(this.key, this.encoding), Buffer.from(iv, this.encoding));
        decipher.setAuthTag(Buffer.from(authTag, this.encoding));
        let str = decipher.update(enc, this.encoding, 'utf8');
        str += decipher.final('utf8');
        return str;
    }

    public async encryptAsync(str: string): Promise<[string, string, string]> {
        const keyBuffer = Buffer.from(this.key, this.encoding);
        const iv = crypto.webcrypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(str);

        const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: this.algorithm.async }, false, ['encrypt']);

        const encrypted = await crypto.subtle.encrypt(
            {
                name: this.algorithm.async,
                iv: iv
            },
            cryptoKey,
            encodedData
        );

        const encryptedArray = new Uint8Array(encrypted);
        const authTagLength = 16; // AES-GCM auth tag is 16 bytes

        // Split encrypted data and auth tag
        const encryptedData = encryptedArray.slice(0, -authTagLength);
        const authTag = encryptedArray.slice(-authTagLength);

        return [Buffer.from(encryptedData).toString(this.encoding), Buffer.from(iv).toString(this.encoding), Buffer.from(authTag).toString(this.encoding)];
    }

    public async decryptAsync(enc: string, iv: string, authTag: string): Promise<string> {
        const keyBuffer = Buffer.from(this.key, this.encoding);
        const ivBuffer = Buffer.from(iv, this.encoding);
        const authTagBuffer = Buffer.from(authTag, this.encoding);
        const encBuffer = Buffer.from(enc, this.encoding);

        const encryptedWithTag = new Uint8Array(encBuffer.length + authTagBuffer.length);
        encryptedWithTag.set(new Uint8Array(encBuffer));
        encryptedWithTag.set(new Uint8Array(authTagBuffer), encBuffer.length);

        const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: this.algorithm.async }, false, ['decrypt']);

        const algorithm = {
            name: this.algorithm.async,
            iv: ivBuffer
        };

        const decrypted = await crypto.subtle.decrypt(algorithm, cryptoKey, encryptedWithTag);

        return new TextDecoder().decode(decrypted);
    }
}
