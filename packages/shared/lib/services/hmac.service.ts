import * as crypto from 'node:crypto';
import { schema } from '@nangohq/database';
import type { DBEnvironment } from '@nangohq/types';

class HmacService {
    private algorithm = 'sha256';

    async isEnabled(id: number): Promise<boolean> {
        const result = await schema().select('hmac_enabled').from<DBEnvironment>('_nango_environments').where({ id });

        const enabled = result[0]?.hmac_enabled ?? false;

        return enabled;
    }

    async getKey(id: number): Promise<string> {
        const result = await schema().select('hmac_key').from<DBEnvironment>('_nango_environments').where({ id });

        const key = result[0]?.hmac_key ?? '';

        return key;
    }

    async verify(expectedDigest: string, id: number, ...values: string[]): Promise<boolean> {
        const actualDigest = await this.digest(id, ...values);
        return expectedDigest === actualDigest;
    }

    async digest(id: number, ...values: string[]): Promise<string> {
        const key = await this.getKey(id);
        const hmac = crypto.createHmac(this.algorithm, key);
        const data = values.join(':');
        hmac.update(data);
        return hmac.digest('hex');
    }
}

export default new HmacService();
