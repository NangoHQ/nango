import { PostHog } from 'posthog-node';

import { baseUrl, NANGO_VERSION, report } from '@nangohq/utils';

import type { CliTelemetryEvent, DBTeam, DBUser } from '@nangohq/types';

export type ProductTrackingTypes =
    | CliTelemetryEvent
    | 'account:trial:extend'
    | 'account:trial:started'
    | 'account:billing:plan_changed'
    | 'account:billing:downgraded'
    | 'account:billing:upgraded'
    | 'deploy:success'
    | 'deploy:error'
    | 'prod:connections:threshold_hit'
    | 'server:resource_capped:connection_creation'
    | 'server:resource_capped:connection_imported'
    | 'server:resource_capped:script_activate'
    | 'server:resource_capped:script_deploy_is_disabled'
    | 'server:resource_capped:action_triggered'
    | 'server:resource_capped:active_records';

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
        user,
        eventProperties,
        userProperties
    }: {
        name: ProductTrackingTypes;
        team: Pick<DBTeam, 'id' | 'name'>;
        user?: Pick<DBUser, 'id' | 'email' | 'name'> | undefined;
        eventProperties?: Record<string | number, any>;
        userProperties?: Record<string | number, any>;
    }) {
        try {
            if (this.client == null) {
                return;
            }

            eventProperties = eventProperties || {};
            userProperties = userProperties || {};

            eventProperties['host'] = baseUrl;
            eventProperties['nango-server-version'] = NANGO_VERSION || 'unknown';

            eventProperties['team-id'] = team.id;
            eventProperties['team-name'] = team.name;
            userProperties['team-id'] = team.id;
            userProperties['team-name'] = team.name;
            let distinctId = `team-${team.id}`;
            if (user) {
                userProperties['email'] = user.email;
                userProperties['name'] = user.name;
                userProperties['id'] = user.id;
                distinctId += `-user-${user.id}`;
            }

            eventProperties['$set'] = userProperties;
            this.client.capture({ event: name, distinctId, properties: eventProperties });
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

            eventProperties = eventProperties || {};
            eventProperties['host'] = baseUrl;
            eventProperties['nango-server-version'] = NANGO_VERSION || 'unknown';
            eventProperties['device-id'] = distinctId;

            this.client.capture({ event: name, distinctId, properties: eventProperties });
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

            let alias = `team-${team.id}`;
            if (user) {
                alias += `-user-${user.id}`;
            }

            this.client.alias({ distinctId: deviceId, alias });
        } catch (err) {
            report(err);
        }
    }
}

export const productTracking = new ProductTracking();
