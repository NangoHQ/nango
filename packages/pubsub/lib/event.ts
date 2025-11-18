import type { DBTeam, DBUser } from '@nangohq/types';

type Serializable = string | number | boolean | Date | null | undefined | Serializable[] | { [key: string]: Serializable };

interface EventBase<TSubject extends string, TType extends string, TPayload extends Serializable> {
    idempotencyKey: string;
    subject: TSubject;
    type: TType;
    payload: TPayload;
    source?: string | undefined;
    createdAt: Date;
}

// All events
type EnforceEventBase<T extends EventBase<any, any, any>> = T;
export type Event = EnforceEventBase<UserCreatedEvent | UsageEvent | TeamUpdatedEvent>;

// User events
export type UserCreatedEvent = EventBase<
    'user',
    'user.created',
    {
        userId: DBUser['id'];
        teamId: DBTeam['id'];
    }
>;

// Team events
export type TeamUpdatedEvent = EventBase<
    'team',
    'team.updated',
    {
        id: DBTeam['id'];
    }
>;

// Usage events
interface UsageEventBase<TType extends string, TPayload extends Serializable> extends EventBase<'usage', TType, TPayload> {
    subject: 'usage';
    type: TType;
    payload: TPayload & {
        value: number;
        properties: {
            accountId: number;
            environmentId: number;
            environmentName: string;
            integrationId: string;
            connectionId: string;
        };
    };
}

export type UsageRecordsEvent = UsageEventBase<
    'usage.records',
    {
        value: number;
        properties: {
            syncId: string;
            model: string;
        };
    }
>;

export type UsageMarEvent = UsageEventBase<
    'usage.monthly_active_records',
    {
        value: number;
        properties: {
            syncId: string;
            model: string;
        };
    }
>;

export type UsageActionsEvent = UsageEventBase<
    'usage.actions',
    {
        value: number;
        properties: {
            actionName: string;
        };
    }
>;

export type UsageConnectionsEvent = UsageEventBase<
    'usage.connections',
    {
        value: number;
    }
>;

export type UsageFunctionExecutionsEvent = UsageEventBase<
    'usage.function_executions',
    {
        value: number;
        properties: {
            type: 'sync' | 'action' | 'webhook' | 'on-event';
            success: boolean;
            functionName: string;
            telemetryBag:
                | {
                      durationMs: number;
                      memoryGb: number;
                      customLogs: number;
                      proxyCalls: number;
                  }
                | undefined;
            frequencyMs?: number | undefined;
        };
    }
>;

export type UsageProxyEvent = UsageEventBase<
    'usage.proxy',
    {
        value: number;
        properties: {
            success: boolean;
        };
    }
>;

export type UsageWebhookForwardEvent = UsageEventBase<
    'usage.webhook_forward',
    {
        value: number;
        properties: {
            success: boolean;
        };
    }
>;

type EnforceUsageEventBase<T extends UsageEventBase<any, any>> = T;
export type UsageEvent = EnforceUsageEventBase<
    UsageMarEvent | UsageRecordsEvent | UsageActionsEvent | UsageConnectionsEvent | UsageFunctionExecutionsEvent | UsageProxyEvent | UsageWebhookForwardEvent
>;
