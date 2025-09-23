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

// Enforce that all events extend the base Event type
type EnforceEventBase<T extends EventBase<any, any, any>> = T;

export type UserCreatedEvent = EventBase<
    'user',
    'user.created',
    {
        userId: DBUser['id'];
        teamId: DBTeam['id'];
    }
>;

export type UsageEvent = EventBase<
    'usage',
    'usage.monthly_active_records' | 'usage.actions' | 'usage.connections' | 'usage.function_executions' | 'usage.proxy',
    {
        value: number;
        properties: {
            accountId: number;
            connectionId: number;
        } & Record<string, Serializable>;
    }
>;

export type TeamEvent = EventBase<
    'team',
    'team.updated',
    {
        id: DBTeam['id'];
    }
>;

export type Event = EnforceEventBase<UserCreatedEvent | UsageEvent | TeamEvent>;
