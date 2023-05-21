import { NangoError } from '@nangohq/shared';
import * as crypto from 'node:crypto';

class HmacService {
    private enabled = process.env['NANGO_HMAC_ENABLED'] === 'true';
    private algorithm = process.env['NANGO_HMAC_ALGORITHM'] || 'sha256';
    private key = process.env['NANGO_HMAC_KEY'];

    constructor() {
        if (!this.enabled) {
            return;
        } else if (!this.key) {
            throw new NangoError('hmac_key_required');
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    verify(expectedDigest: string, ...values: string[]): boolean {
        if (!this.enabled) {
            throw new NangoError('hmac_not_enabled');
        }
        const actualDigest = this.digest(...values);
        return expectedDigest === actualDigest;
    }

    digest(...values: string[]): string {
        if (!this.enabled) {
            throw new NangoError('hmac_not_enabled');
        } else if (!this.key) {
            throw new NangoError('hmac_key_required');
        }
        const hmac = crypto.createHmac(this.algorithm, this.key);
        const data = values.join(':');
        hmac.update(data);
        return hmac.digest('hex');
    }
}

export default new HmacService();
