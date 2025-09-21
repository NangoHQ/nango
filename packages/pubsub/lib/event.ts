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
        properties: { accountId: number; connectionId: number };
    };
}

export type UsageMarEvent = UsageEventBase<
    'usage.monthly_active_records',
    {
        value: number;
        properties: {
            accountId: number;
            environmentId: number;
            providerConfigKey: string;
            connectionId: number;
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
            accountId: number;
            connectionId: number;
            environmentId: number;
            providerConfigKey: string;
            actionName: string;
        };
    }
>;

export type UsageConnectionsEvent = UsageEventBase<
    'usage.connections',
    {
        value: number;
        properties: {
            accountId: number;
            environmentId: number;
            providerConfigKey: string;
            connectionId: number;
        };
    }
>;

export type UsageFunctionExecutionsEvent = UsageEventBase<
    'usage.function_executions',
    {
        value: number;
        properties: {
            type: 'sync' | 'action' | 'webhook' | 'on-event';
            success: boolean;
            accountId: number;
            connectionId: number;
            telemetryBag:
                | {
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
            accountId: number;
            environmentId: number;
            providerConfigKey: string;
            connectionId: number;
            provider: string;
            success: boolean;
        };
    }
>;

type EnforceUsageEventBase<T extends UsageEventBase<any, any>> = T;
export type UsageEvent = EnforceUsageEventBase<UsageMarEvent | UsageActionsEvent | UsageConnectionsEvent | UsageFunctionExecutionsEvent | UsageProxyEvent>;
