import { AsyncLocalStorage } from 'node:async_hooks';

import { PostHog } from 'posthog-node';

import { baseUrl, NANGO_VERSION, report } from '@nangohq/utils';

import type { CliTelemetryEvent, DBEnvironment, DBTeam, DBUser } from '@nangohq/types';

export type ProductTrackingTypes =
    | CliTelemetryEvent
    | 'account:billing:plan_changed'
    | 'account:billing:plan_changed:v2'
    | 'account:billing:downgraded'
    | 'account:billing:upgraded'
    | 'agents:session_start'
    | 'agents:session_end'
    | 'agents:tool_call_complete'
    | 'agents:proxy_request_complete'
    | 'agents:tool_search_complete';

/**
 * Only ids: no email, no names, and no account name either, which defaults to "<person>'s Team" for
 * anyone who signed up with a personal address. The plan is a group property, not an event one.
 */
export interface TrackingContext {
    team: Pick<DBTeam, 'id'>;
    /**
     * Some events are account-wide and have no environment to resolve, so this stays optional.
     */
    environment?: Pick<DBEnvironment, 'is_production'> | null | undefined;
    user?: Pick<DBUser, 'id'> | null | undefined;
}

/**
 * A context where nothing is guaranteed: the request may not be authenticated, and an event may be
 * emitted with no context at all.
 */
export type TrackingContextInput = Partial<Omit<TrackingContext, 'team'>> & { team?: Pick<DBTeam, 'id'> | null | undefined };

/**
 * Resolved lazily, at emit time: a request enters this context before auth runs, so the account
 * and environment it reads are only set later in the request.
 */
type TrackingContextResolver = () => TrackingContextInput;

const contextStorage = new AsyncLocalStorage<TrackingContextResolver>();

/**
 * Run `fn` with a tracking context that every posthog event emitted inside it inherits.
 *
 * A context field an event passes itself wins over the ambient one. The properties resolved from the
 * context always win over an event's own property bags, so an event cannot claim another account.
 */
export function withProductTrackingContext<T>(resolver: TrackingContextResolver, fn: () => T): T {
    return contextStorage.run(resolver, fn);
}

function resolveContext(explicit: TrackingContextInput): TrackingContext | null {
    let ambient: TrackingContextInput | undefined;
    try {
        ambient = contextStorage.getStore()?.();
    } catch (err) {
        report(err);
    }

    const team = explicit.team ?? ambient?.team;
    if (!team) {
        return null;
    }

    return {
        team,
        environment: explicit.environment ?? ambient?.environment,
        user: explicit.user ?? ambient?.user
    };
}

function commonProperties(surface: 'server' | 'cli'): Record<string, unknown> {
    return {
        surface,
        host: baseUrl,
        server_version: NANGO_VERSION || 'unknown'
    };
}

function contextProperties({ environment, user }: TrackingContext): Record<string, unknown> {
    return {
        ...(environment ? { is_production: environment.is_production } : {}),
        // An event with no person behind it is attached to the account group instead of inventing one.
        ...(user ? {} : { $process_person_profile: false })
    };
}

/**
 * A person is their user id. An event with no person still needs a distinct id, so it carries the
 * account's, which creates no profile because person processing is off for those events.
 */
function distinctIdFor({ team, user }: TrackingContext): string {
    return user ? String(user.id) : `account-${team.id}`;
}

/** Counting accounts rather than people is what the group is for, so every event carries it. */
function groupsFor({ team }: TrackingContext): Record<string, string> {
    return { company: String(team.id) };
}

class ProductTracking {
    client: PostHog | undefined;

    constructor() {
        const key = process.env['PUBLIC_POSTHOG_KEY'];
        if (!key) {
            return;
        }

        try {
            this.client = new PostHog(key, {
                host: process.env['PUBLIC_POSTHOG_HOST'] || 'https://app.posthog.com'
            });
            this.client.enable();
        } catch (err) {
            report(err);
        }
    }

    public track({
        name,
        team,
        environment,
        user,
        eventProperties,
        structuredProperties
    }: {
        name: ProductTrackingTypes;
        eventProperties?: Record<string, string | number | boolean | null | undefined>;
        /**
         * Values the taxonomy's primitives-only rule does not allow, carried by the exception granted
         * to tool search so a query can be read next to the results it returned.
         */
        structuredProperties?: Record<string, unknown>;
    } & TrackingContextInput) {
        try {
            if (this.client == null) {
                return;
            }

            const context = resolveContext({ team, environment, user });
            if (!context) {
                report(new Error(`Product tracking event "${name}" has no account to attach to`));
                return;
            }

            const properties = {
                ...eventProperties,
                ...structuredProperties,
                ...commonProperties('server'),
                ...contextProperties(context)
            };

            this.client.capture({ event: name, distinctId: distinctIdFor(context), properties, groups: groupsFor(context) });
        } catch (err) {
            report(err);
        }
    }

    /**
     * Track an event that isn't tied to a resolved team, e.g. CLI events sent before or without authentication.
     * The distinctId is a client-generated device id, and the event keeps the surface it came from
     * rather than the one relaying it.
     */
    public trackAnonymous({
        name,
        distinctId,
        eventProperties
    }: {
        name: ProductTrackingTypes;
        distinctId: string;
        eventProperties?: Record<string, string | number | boolean | null | undefined>;
    }) {
        try {
            if (this.client == null) {
                return;
            }

            this.client.capture({ event: name, distinctId, properties: { ...eventProperties, ...commonProperties('cli') } });
        } catch (err) {
            report(err);
        }
    }

    /**
     * Link an anonymous CLI device id to an identified team/user, so anonymous CLI
     * events (tracked via trackAnonymous) merge into the identified profile in PostHog.
     * Called from authenticated CLI requests that carry a device id, e.g. deploy.
     */
    public alias({ deviceId, team, user }: { deviceId: string; team: Pick<DBTeam, 'id'>; user?: Pick<DBUser, 'id'> | undefined }) {
        try {
            if (this.client == null) {
                return;
            }

            this.client.alias({ distinctId: deviceId, alias: distinctIdFor({ team, user }) });
        } catch (err) {
            report(err);
        }
    }
}

export const productTracking = new ProductTracking();
