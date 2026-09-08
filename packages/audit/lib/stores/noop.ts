import { Ok } from '@nangohq/utils';

import type { AuditReader, AuditTrailPage, AuditWriter } from '../store.js';
import type { AuditTrailTotal } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class NoopAuditStore implements AuditWriter, AuditReader {
    record(): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }

    list(): Promise<Result<AuditTrailPage>> {
        return Promise.resolve(Ok({ events: [], nextCursor: null }));
    }

    count(): Promise<Result<AuditTrailTotal>> {
        return Promise.resolve(Ok({ value: 0, relation: 'eq' }));
    }
}
