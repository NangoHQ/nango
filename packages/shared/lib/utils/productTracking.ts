import { AsyncLocalStorage } from 'node:async_hooks';

import { PostHog } from 'posthog-node';

import { baseUrl, NANGO_VERSION, report } from '@nangohq/utils';

import type { CliTelemetryEvent, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

export type ProductTrackingTypes =
    | CliTelemetryEvent
    | 'account:billing:plan_changed'
    | 'account:billing:downgraded'
    | 'account:billing:upgraded'
    | 'session_created'
    | 'session_terminated'
    | 'nango_execute'
    | 'execute_pinned_tool'
    | 'nango_proxy';

export interface TrackingContext {
    team: Pick<DBTeam, 'id' | 'name'>;
    /**
     * Some events are account-wide and have no environment to resolve, so this stays optional.
     */
    environment?: Pick<DBEnvironment, 'id' | 'name' | 'is_production'> | null | undefined;
    plan?: Pick<DBPlan, 'name'> | null | undefined;
    user?: Pick<DBUser, 'id' | 'email' | 'name'> | null | undefined;
}

/**
 * A context where nothing is guaranteed: the request may not be authenticated, and an event may be
 * emitted with no context at all.
 */
export type TrackingContextInput = Partial<Omit<TrackingContext, 'team'>> & { team?: Pick<DBTeam, 'id' | 'name'> | null | undefined };

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
        plan: explicit.plan ?? ambient?.plan,
        user: explicit.user ?? ambient?.user
    };
}

function commonProperties(): Record<string, unknown> {
    return {
        host: baseUrl,
        'nango-server-version': NANGO_VERSION || 'unknown'
    };
}

function accountProperties({ team, plan }: Pick<TrackingContext, 'team' | 'plan'>): Record<string, unknown> {
    return {
        'account-id': team.id,
        'team-id': team.id,
        'team-name': team.name,
        ...(plan ? { plan: plan.name } : {})
    };
}

function contextEventProperties({ team, environment, plan }: TrackingContext): Record<string, unknown> {
    return {
        ...accountProperties({ team, plan }),
        ...(environment
            ? {
                  'environment-id': environment.id,
                  'environment-name': environment.name,
                  'is-prod': environment.is_production
              }
            : {})
    };
}

function contextUserProperties({ team, plan, user }: TrackingContext): Record<string, unknown> {
    return {
        ...accountProperties({ team, plan }),
        ...(user ? { id: user.id, email: user.email, name: user.name } : {})
    };
}

function distinctIdFor({ team, user }: { team: Pick<DBTeam, 'id'>; user?: Pick<DBUser, 'id'> | null | undefined }): string {
    return user ? `team-${team.id}-user-${user.id}` : `team-${team.id}`;
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
        plan,
        user,
        eventProperties,
        userProperties
    }: {
        name: ProductTrackingTypes;
        eventProperties?: Record<string | number, any>;
        userProperties?: Record<string | number, any>;
    } & TrackingContextInput) {
        try {
            if (this.client == null) {
                return;
            }

            const context = resolveContext({ team, environment, plan, user });
            if (!context) {
                report(new Error(`Product tracking event "${name}" has no account to attach to`));
                return;
            }

            const properties = {
                ...eventProperties,
                ...commonProperties(),
                ...contextEventProperties(context),
                $set: { ...userProperties, ...contextUserProperties(context) }
            };

            this.client.capture({ event: name, distinctId: distinctIdFor(context), properties });
        } catch (err) {
            report(err);
        }
    }

    /**
     * Track an event that isn't tied to a resolved team, e.g. CLI events sent before or without authentication.
     * The distinctId is a client-generated device id
     */
    public trackAnonymous({
        name,
        distinctId,
        eventProperties
    }: {
        name: ProductTrackingTypes;
        distinctId: string;
        eventProperties?: Record<string | number, any>;
    }) {
        try {
            if (this.client == null) {
                return;
            }

            const context = resolveContext({});
            const properties = {
                ...eventProperties,
                ...commonProperties(),
                ...(context ? contextEventProperties(context) : {}),
                'device-id': distinctId
            };

            this.client.capture({ event: name, distinctId, properties });
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
