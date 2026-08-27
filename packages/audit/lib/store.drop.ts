import { Ok } from '@nangohq/utils';

import type { AuditReader, AuditTrailPage, AuditWriter } from './store.js';
import type { Result } from '@nangohq/utils';

export class DropAuditStore implements AuditWriter, AuditReader {
    record(): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }

    list(): Promise<Result<AuditTrailPage>> {
        return Promise.resolve(Ok({ events: [], nextCursor: null }));
    }
}
