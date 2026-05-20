import type {
    DBOnEventScript,
    DeployedNangoActionFunction,
    DeployedNangoFunction,
    DeployedNangoOnEventFunction,
    DeployedNangoSyncFunction,
    FunctionSource,
    NangoConfigMetadata,
    OnEventType
} from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export const EVENT_TYPE_MAPPINGS: Record<DBOnEventScript['event'], OnEventType> = {
    POST_CONNECTION_CREATION: 'post-connection-creation',
    PRE_CONNECTION_DELETION: 'pre-connection-deletion',
    VALIDATE_CONNECTION: 'validate-connection'
} as const;

export const eventTypeMapper = {
    fromDb: (event: DBOnEventScript['event']): OnEventType => {
        return EVENT_TYPE_MAPPINGS[event];
    },
    toDb: (eventType: OnEventType): DBOnEventScript['event'] => {
        for (const [key, value] of Object.entries(EVENT_TYPE_MAPPINGS)) {
            if (value === eventType) {
                return key as DBOnEventScript['event'];
            }
        }
        throw new Error(`Unknown event type: ${eventType}`);
    }
};

export interface FunctionRow {
    id: number;
    name: string;
    type: 'sync' | 'action' | 'on-event';
    metadata: NangoConfigMetadata | null;
    input: string | null;
    returns: string[] | null;
    json_schema: JSONSchema7 | null;
    runs: string | null;
    auto_start: boolean | null;
    track_deletes: boolean | null;
    enabled: boolean;
    last_deployed: Date;
    source: FunctionSource;
    event: string | null;
}

export function toDeployedNangoFunction(row: FunctionRow): DeployedNangoFunction | undefined {
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
            return out;
        }
        case 'on-event': {
            const apiEvent = row.event ? EVENT_TYPE_MAPPINGS[row.event as DBOnEventScript['event']] : undefined;
            if (!apiEvent) {
                return undefined;
            }
            const out: DeployedNangoOnEventFunction = {
                ...base,
                type: 'on-event',
                event: apiEvent,
                ...deployedMeta
            };
            return out;
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
            return out;
        }
        default:
            return undefined;
    }
}
