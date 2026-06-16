import { Ok } from '@nangohq/utils';

import type { Transport } from './transport.js';
import type { Result } from '@nangohq/utils';

export class NoOpTransport implements Transport {
    // eslint-disable-next-line @typescript-eslint/require-await
    public async connect(): Promise<Result<void>> {
        return Ok(undefined);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async disconnect(): Promise<Result<void>> {
        return Ok(undefined);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async publish(): Promise<Result<void>> {
        return Ok(undefined);
    }

    public subscribe(): void {}
}
