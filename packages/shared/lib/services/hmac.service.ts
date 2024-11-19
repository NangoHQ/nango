import * as crypto from 'node:crypto';
import type { DBEnvironment } from '@nangohq/types';

class HmacService {
    private algorithm = 'sha256';

    verify({
        receivedDigest,
        environment,
        values = []
    }: {
        receivedDigest: string;
        environment: Pick<DBEnvironment, 'hmac_key'>;
        values?: (string | undefined)[];
    }): boolean {
        const definedValues: string[] = values.flatMap((v) => (v === undefined ? [] : [v]));
        const actualDigest = this.computeDigest({ key: environment.hmac_key!, values: definedValues });
        return receivedDigest === actualDigest;
    }

    computeDigest({ key, values = [] }: { key: string; values?: string[] }): string {
        const hmac = crypto.createHmac(this.algorithm, key);
        const data = values.join(':');
        hmac.update(data);
        return hmac.digest('hex');
    }
}

export default new HmacService();
