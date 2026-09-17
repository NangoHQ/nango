import type { HTTP_METHOD } from '../nangoYaml/index.js';
import type { OnEventType } from '../scripts/on-events/api.js';
import type { FunctionTriggerDefinition } from './config.js';
import type { JsonValue } from 'type-fest';

// The inbound HTTP request that initiated the run.
export type HttpRequest = {
    method: HTTP_METHOD;
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body: JsonValue;
};

// Coalescing summary, present on an HTTP trigger when `debounce` is configured and coalescing happened.
export type CoalescedInfo = {
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
};

// `debounce.take: 'all'` delivers the whole coalesced batch, so the payload becomes an array; otherwise a single input.
type HttpPayload<TTrigger, TInput> = TTrigger extends { debounce: { take: 'all' } } ? TInput[] : TInput;

type TriggerBase = {
    /**
     * Present when the run carries connection context (invoke calls may pass one;
     * HTTP/event may resolve one). Undefined for connection-less runs.
     */
    connection?: { connectionId: string; integrationId: string };
};

// The per-kind runtime trigger shapes an `exec` can receive.
export type InvokeTrigger<TInput> = TriggerBase & { kind: 'invoke'; input: TInput };
export type ScheduleTrigger = TriggerBase & { kind: 'schedule'; input: null };
export type HttpTrigger<TTrigger, TInput> = TriggerBase & {
    kind: 'http';
    input: HttpPayload<TTrigger, TInput>;
    request: HttpRequest;
    subscriptions?: string[];
    coalesced?: CoalescedInfo;
};
export type EventTrigger = TriggerBase & { kind: 'event'; input: { event: OnEventType } };

// The runtime trigger a function `exec` receives.
export type Trigger<TTrigger extends FunctionTriggerDefinition | undefined, TInput> = TTrigger extends { kind: 'schedule' }
    ? ScheduleTrigger
    : TTrigger extends { kind: 'http' }
      ? HttpTrigger<TTrigger, TInput>
      : TTrigger extends { kind: 'event' }
        ? EventTrigger
        : InvokeTrigger<TInput>;

// The JSON-safe runtime trigger for transport betwwen services.
export type FunctionTrigger = Trigger<FunctionTriggerDefinition, JsonValue>;
