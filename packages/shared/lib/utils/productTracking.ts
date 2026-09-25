import { AsyncLocalStorage } from 'node:async_hooks';

import { PostHog } from 'posthog-node';

import { baseUrl, FixedSizeMap, NANGO_VERSION, report } from '@nangohq/utils';

import type { AccountGroupProperties, CliTelemetryEvent, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

export type ProductTrackingTypes =
    | CliTelemetryEvent
    | 'account:billing:plan_changed'
    | 'account:billing:plan_changed:v2'
    | 'account:billing:downgraded'
    | 'account:billing:upgraded'
    | 'agents:session_start'
    | 'agents:session_end'
    | 'agents:tool_call_complete'
    | 'agents:proxy_request_complete';

const ACCOUNT_GROUP = 'company';

type TrackedTeam = Pick<DBTeam, 'id'> & Partial<Pick<DBTeam, 'name' | 'created_at'>>;

type TrackedPlan = Pick<DBPlan, 'name'>;

/** No email and no person's name. The account name and plan are group properties, never event ones. */
export interface TrackingContext {
    team: TrackedTeam;
    /**
     * Some events are account-wide and have no environment to resolve, so this stays optional.
     */
    environment?: Pick<DBEnvironment, 'is_production'> | null | undefined;
    user?: Pick<DBUser, 'id'> | null | undefined;
    plan?: TrackedPlan | null | undefined;
}

/**
 * A context where nothing is guaranteed: the request may not be authenticated, and an event may be
 * emitted with no context at all.
 */
export type TrackingContextInput = Partial<Omit<TrackingContext, 'team'>> & { team?: TrackedTeam | null | undefined };

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
        user: explicit.user ?? ambient?.user,
        plan: explicit.plan ?? ambient?.plan
    };
}

export function accountGroupProperties(team: TrackedTeam, plan: TrackedPlan | null | undefined): AccountGroupProperties {
    return {
        ...(team.name ? { name: team.name } : {}),
        ...(plan ? { plan: plan.name } : {}),
        ...(team.created_at ? { created_date: new Date(team.created_at).toISOString() } : {})
    };
}

function commonProperties(surface: 'server' | 'cli'): Record<string, unknown> {
    return {
        surface,
        host: baseUrl,
        server_version: NANGO_VERSION || 'unknown'
    };
}

function contextProperties({ environment }: TrackingContext): Record<string, unknown> {
    return environment ? { is_production: environment.is_production } : {};
}

// Keep person processing on for `account-<id>`: PostHog links no personless event to a group.
function distinctIdFor({ team, user }: TrackingContext): string {
    return user ? String(user.id) : `account-${team.id}`;
}

/** Counting accounts rather than people is what the group is for, so every event carries it. */
function groupsFor({ team }: TrackingContext): Record<string, string> {
    return { [ACCOUNT_GROUP]: String(team.id) };
}

class ProductTracking {
    client: PostHog | undefined;
    // Each groupIdentify sends its own $groupidentify event. Send one per property change, not one per capture.
    readonly identifiedAccounts = new FixedSizeMap<number, AccountGroupProperties>(10_000);

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
        plan,
        eventProperties
    }: {
        name: ProductTrackingTypes;
        eventProperties?: Record<string, string | number | boolean | null | undefined>;
    } & TrackingContextInput) {
        try {
            if (this.client == null) {
                return;
            }

            const context = resolveContext({ team, environment, user, plan });
            if (!context) {
                report(new Error(`Product tracking event "${name}" has no account to attach to`));
                return;
            }

            const properties = {
                ...eventProperties,
                ...commonProperties('server'),
                ...contextProperties(context)
            };

            this.identifyAccount(this.client, context);
            this.client.capture({ event: name, distinctId: distinctIdFor(context), properties, groups: groupsFor(context) });
        } catch (err) {
            report(err);
        }
    }

    private identifyAccount(client: PostHog, { team, plan }: TrackingContext) {
        try {
            const sent = this.identifiedAccounts.get(team.id) ?? {};
            const changed = Object.fromEntries(
                Object.entries(accountGroupProperties(team, plan)).filter(([key, value]) => sent[key as keyof AccountGroupProperties] !== value)
            );
            if (Object.keys(changed).length === 0) {
                return;
            }

            client.groupIdentify({ groupType: ACCOUNT_GROUP, groupKey: String(team.id), properties: changed });
            this.identifiedAccounts.set(team.id, { ...sent, ...changed });
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

            this.client.capture({
                event: name,
                distinctId,
                properties: { ...eventProperties, ...commonProperties('cli'), $process_person_profile: false }
            });
        } catch (err) {
            report(err);
        }
    }
}

export const productTracking = new ProductTracking();
