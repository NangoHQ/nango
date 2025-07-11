import type { BillingMetric, DBTeam, DBUser } from '@nangohq/types';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue } | Record<string, any>;

interface EventBase<TSubject extends string, TType extends string, TPayload extends JsonValue> {
    idempotencyKey: string;
    subject: TSubject;
    type: TType;
    payload: TPayload;
    source?: string | undefined;
    createdAt: Date;
}

// Enforce that all events extend the base Event type
type EnforceEventBase<T extends EventBase<any, any, any>> = T;

type UserCreatedEvent = EventBase<
    'user',
    'user.created',
    {
        user: DBUser;
        team: DBTeam;
    }
>;

type BillingEvent = EventBase<'billing', 'billing.metric', BillingMetric[]>;

export type Event = EnforceEventBase<UserCreatedEvent | BillingEvent>;
