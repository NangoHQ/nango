import { Err, Ok } from '@nangohq/utils';

import { eventTypeMapper } from '../../on-event-scripts.service.js';

import type { FunctionRow } from './models/functions.js';
import type {
    DBOnEventScript,
    DeployedNangoActionFunction,
    DeployedNangoFunction,
    DeployedNangoOnEventFunction,
    DeployedNangoSyncFunction
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export function toDeployedNangoFunction(row: FunctionRow): Result<DeployedNangoFunction> {
    const description = row.metadata?.description;
    const scopes = row.metadata?.scopes;
    const base = {
        name: row.name,
        ...(description !== undefined && { description }),
        ...(scopes !== undefined && { scopes })
    };
    const deployedMeta = {
        id: row.id,
        enabled: row.enabled,
        last_deployed: row.last_deployed.toISOString(),
        source: row.source
    };

    switch (row.type) {
        case 'sync': {
            const out: DeployedNangoSyncFunction = {
                ...base,
                type: 'sync',
                ...(row.input !== null && { input: row.input }),
                returns: row.returns ?? [],
                json_schema: row.json_schema,
                runs: row.runs,
                auto_start: row.auto_start ?? false,
                track_deletes: row.track_deletes ?? false,
                ...deployedMeta
            };
            return Ok(out);
        }
        case 'on-event': {
            if (!row.event) {
                return Err(new Error('Unknown on-event type: null'));
            }

            const apiEvent = eventTypeMapper.fromDb(row.event as DBOnEventScript['event']);
            if (!apiEvent) {
                return Err(new Error(`Unknown on-event type: ${row.event}`));
            }

            const out: DeployedNangoOnEventFunction = {
                ...base,
                type: 'on-event',
                event: apiEvent,
                ...deployedMeta
            };
            return Ok(out);
        }
        case 'action': {
            const out: DeployedNangoActionFunction = {
                ...base,
                type: 'action',
                ...(row.input !== null && { input: row.input }),
                returns: row.returns ?? [],
                json_schema: row.json_schema,
                ...deployedMeta
            };
            return Ok(out);
        }
    }

    return Err(new Error(`Unknown function type: ${String(row.type)}`));
}
