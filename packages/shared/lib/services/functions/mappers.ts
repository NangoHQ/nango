import { Err, Ok } from '@nangohq/utils';

import type { FunctionRow } from './models/functions.js';
import type {
    DBOnEventScript,
    DeployedNangoActionFunction,
    DeployedNangoFunction,
    DeployedNangoOnEventFunction,
    DeployedNangoSyncFunction,
    OnEventType
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const DB_TO_API_EVENT_TYPE: Record<DBOnEventScript['event'], OnEventType> = {
    POST_CONNECTION_CREATION: 'post-connection-creation',
    PRE_CONNECTION_DELETION: 'pre-connection-deletion',
    VALIDATE_CONNECTION: 'validate-connection'
} as const;

const API_TO_DB_EVENT_TYPE: Record<OnEventType, DBOnEventScript['event']> = {
    'post-connection-creation': 'POST_CONNECTION_CREATION',
    'pre-connection-deletion': 'PRE_CONNECTION_DELETION',
    'validate-connection': 'VALIDATE_CONNECTION'
} as const;

export const eventTypeMapper = {
    fromDb: (event: DBOnEventScript['event']): OnEventType => {
        return DB_TO_API_EVENT_TYPE[event];
    },
    toDb: (eventType: OnEventType): DBOnEventScript['event'] => {
        return API_TO_DB_EVENT_TYPE[eventType];
    }
};

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

            const apiEvent = DB_TO_API_EVENT_TYPE[row.event as DBOnEventScript['event']];
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
