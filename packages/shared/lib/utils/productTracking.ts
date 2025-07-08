import { PostHog } from 'posthog-node';

import { NANGO_VERSION, baseUrl, report } from '@nangohq/utils';

import type { DBTeam, DBUser } from '@nangohq/types';

export type ProductTrackingTypes =
    | 'account:trial:extend'
    | 'account:trial:started'
    | 'account:billing:plan_changed'
    | 'account:billing:downgraded'
    | 'account:billing:upgraded'
    | 'server:resource_capped:connection_creation'
    | 'server:resource_capped:connection_imported'
    | 'server:resource_capped:script_activate'
    | 'server:resource_capped:script_deploy_is_disabled'
    | 'deploy:success';

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
}

export const productTracking = new ProductTracking();
