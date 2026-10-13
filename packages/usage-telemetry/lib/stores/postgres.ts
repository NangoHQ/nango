import tracer from 'dd-trace';

import { Err, getLogger, Ok, stringifyError } from '@nangohq/utils';

import { USAGE_TELEMETRY_SCHEMA, USAGE_TELEMETRY_TABLE } from '../postgres/schema.js';

import type { DBPoint } from '../postgres/schema.js';
import type { UsageTelemetryWriter } from '../store.js';
import type { UsagePoint } from '../types.js';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const logger = getLogger('usage-telemetry');

const INSERT_BATCH_SIZE = 1000;

export class PostgresUsageStore implements UsageTelemetryWriter {
    constructor(
        private readonly knex: Knex,
        private readonly schema: string = USAGE_TELEMETRY_SCHEMA
    ) {}

    /** All batches go in one transaction, so a failure leaves none of the points behind. */
    async record(points: UsagePoint[]): Promise<Result<void>> {
        if (points.length === 0) {
            return Ok(undefined);
        }
        const rows: DBPoint[] = points.map((point) => ({
            ts: point.ts,
            value: point.value,
            metric: point.metric,
            attributes: point.attributes
        }));

        return await tracer.trace('nango.usage_telemetry.postgres.record', async (span) => {
            try {
                await this.knex.transaction(async (trx) => {
                    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
                        await trx
                            .withSchema(this.schema)
                            .table(USAGE_TELEMETRY_TABLE)
                            .insert(rows.slice(offset, offset + INSERT_BATCH_SIZE))
                            .onConflict(['metric', 'ts', 'attributes'])
                            .ignore();
                    }
                });
                return Ok(undefined);
            } catch (err) {
                span?.addTags({ error: stringifyError(err) });
                logger.error(`Failed to record ${points.length} usage telemetry point(s): ${stringifyError(err)}`);
                return Err(new Error('failed_to_record_usage_telemetry', { cause: err }));
            } finally {
                span?.finish();
            }
        });
    }
}
