import { AsyncLocalStorage } from 'node:async_hooks';

import { PostHog } from 'posthog-node';

import { baseUrl, FixedSizeMap, NANGO_VERSION, report } from '@nangohq/utils';

import type { AccountGroupProperties, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

export type ProductTrackingTypes =
    | 'auth:account_create'
    | 'auth:user_create'
    | 'functions:command_start'
    | 'billing:plan_submit'
    | 'billing:plan_update'
    | 'agents:session_start'
    | 'agents:session_end'
    | 'agents:tool_call_complete'
    | 'agents:proxy_request_complete'
    | 'agents:tool_search_complete'
    | 'playground:agent_turn_complete';

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
type TrackingContextResolver = () => TrackingContextInput & { impersonated?: boolean };

const contextStorage = new AsyncLocalStorage<TrackingContextResolver>();

const IMPERSONATED = 'impersonated';

/**
 * Run `fn` with a tracking context that every posthog event emitted inside it inherits.
 *
 * A context field an event passes itself wins over the ambient one. The properties resolved from the
 * context always win over an event's own property bags, so an event cannot claim another account.
 */
export function withProductTrackingContext<T>(resolver: TrackingContextResolver, fn: () => T): T {
    return contextStorage.run(resolver, fn);
}

function resolveContext(explicit: TrackingContextInput): TrackingContext | typeof IMPERSONATED | null {
    let ambient: ReturnType<TrackingContextResolver> | undefined;
    try {
        ambient = contextStorage.getStore()?.();
    } catch (err) {
        report(err);
    }

    if (ambient?.impersonated) {
        return IMPERSONATED;
    }

    const team = explicit.team ?? ambient?.team;
    if (!team) {
        return null;
    }

    return {
        team,
        environment: explicit.environment ?? ambient?.environment,
        user: explicit.user ?? ambient?.user,
        // Without an explicit plan, an event uses the plan its request loaded during auth.
        // A plan change later in that request makes it stale, so `plan: null` turns the fallback off.
        plan: explicit.plan === null ? null : (explicit.plan ?? ambient?.plan)
    };
}

export function accountGroupProperties(team: TrackedTeam, plan: TrackedPlan | null | undefined): AccountGroupProperties {
    return {
        ...(team.name ? { name: team.name } : {}),
        ...(plan ? { plan: plan.name } : {}),
        ...(team.created_at ? { created_date: new Date(team.created_at).toISOString() } : {})
    };
}

export function isInternalAccount(users: Pick<DBUser, 'email'>[]): boolean {
    return users.length > 0 && users.every((user) => user.email.toLowerCase().endsWith('@nango.dev'));
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

    /** Use the same account identity, group name and properties for events captured outside `track`. */
    public getServerEventAttribution(context: TrackingContextInput) {
        const resolved = resolveContext(context);
        if (!resolved || resolved === IMPERSONATED) {
            return null;
        }

        return this.attribute(resolved);
    }

    private attribute(resolved: TrackingContext) {
        if (this.client) {
            this.identifyAccount(this.client, resolved);
        }

        return {
            distinctId: distinctIdFor(resolved),
            groups: groupsFor(resolved),
            properties: { ...commonProperties('server'), ...contextProperties(resolved) }
        };
    }

    public track({
        name,
        team,
        environment,
        user,
        plan,
        eventProperties,
        structuredProperties
    }: {
        name: ProductTrackingTypes;
        eventProperties?: Record<string, string | number | boolean | null | undefined>;
        /**
         * Values the taxonomy's primitives-only rule does not allow, carried by the exception granted
         * to tool search so a query can be read next to the results it returned.
         */
        structuredProperties?: Record<string, ReadonlyArray<Record<string, string | number | boolean>>>;
    } & TrackingContextInput) {
        try {
            if (this.client == null) {
                return;
            }

            const resolved = resolveContext({ team, environment, user, plan });
            if (resolved === IMPERSONATED) {
                return;
            }
            if (!resolved) {
                report(new Error(`Product tracking event "${name}" has no account to attach to`));
                return;
            }
            const attribution = this.attribute(resolved);

            const properties = {
                ...eventProperties,
                ...structuredProperties,
                ...attribution.properties
            };

            this.client.capture({ event: name, distinctId: attribution.distinctId, properties, groups: attribution.groups });
        } catch (err) {
            report(err);
        }
    }

    public identifyAccountGroup(teamId: number, properties: AccountGroupProperties) {
        if (this.client) {
            this.sendGroupProperties(this.client, teamId, properties);
        }
    }

    private identifyAccount(client: PostHog, { team, plan }: TrackingContext) {
        this.sendGroupProperties(client, team.id, accountGroupProperties(team, plan));
    }

    private sendGroupProperties(client: PostHog, teamId: number, properties: AccountGroupProperties) {
        try {
            const sent = this.identifiedAccounts.get(teamId) ?? {};
            const changed = Object.fromEntries(Object.entries(properties).filter(([key, value]) => sent[key as keyof AccountGroupProperties] !== value));
            if (Object.keys(changed).length === 0) {
                return;
            }

            client.groupIdentify({ groupType: ACCOUNT_GROUP, groupKey: String(teamId), properties: changed });
            this.identifiedAccounts.set(teamId, { ...sent, ...changed });
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

    public async shutdown(): Promise<void> {
        try {
            await this.client?.shutdown();
        } catch (err) {
            report(err);
        }
    }
}

export const productTracking = new ProductTracking();
