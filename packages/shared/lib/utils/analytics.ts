import { PostHog } from 'posthog-node';
import { getBaseUrl, localhostUrl, dirname, UserType, isCloud, isStaging } from '../utils/utils.js';
import ip from 'ip';
import errorManager, { ErrorSourceEnum } from './error.manager.js';
import { readFileSync } from 'fs';
import path from 'path';
import accountService from '../services/account.service.js';
import environmentService from '../services/environment.service.js';
import userService from '../services/user.service.js';
import type { Account, User } from '../models/Admin.js';
import { LogActionEnum } from '../models/Activity.js';

export enum AnalyticsTypes {
    ACCOUNT_CREATED = 'server:account_created',
    ACCOUNT_JOINED = 'server:account_joined',
    API_CONNECTION_INSERTED = 'server:api_key_connection_inserted',
    API_CONNECTION_UPDATED = 'server:api_key_connection_updated',
    CONFIG_CREATED = 'server:config_created',
    CONNECTION_INSERTED = 'server:connection_inserted',
    CONNECTION_LIST_FETCHED = 'server:connection_list_fetched',
    CONNECTION_UPDATED = 'server:connection_updated',
    ONBOARDING_0 = 'onboarding:step_1_authorize',
    ONBOARDING_1 = 'onboarding:step_2_sync',
    ONBOARDING_2 = 'onboarding:step_3_receive_webhooks',
    ONBOARDING_3 = 'onboarding:step_4_action_writeback',
    ONBOARDING_4 = 'onboarding:step_5_ship_first_integration',
    PRE_API_KEY_AUTH = 'server:pre_api_key_auth',
    PRE_APP_AUTH = 'server:pre_appauth',
    PRE_BASIC_API_KEY_AUTH = 'server:pre_basic_api_key_auth',
    PRE_UNAUTH = 'server:pre_unauth',
    PRE_WS_OAUTH = 'server:pre_ws_oauth',
    SYNC_DEPLOY_SUCCESS = 'sync:deploy_succeeded',
    SYNC_PAUSE = 'sync:command_pause',
    SYNC_RUN = 'sync:command_run',
    SYNC_UNPAUSE = 'sync:command_unpause',
    UNAUTH_CONNECTION_INSERTED = 'server:unauth_connection_inserted',
    UNAUTH_CONNECTION_UPDATED = 'server:unauth_connection_updated',
    WEB_CONNECION_CREATED = 'web:connection_created',
    WEB_ACCOUNT_SIGNUP = 'web:account_signup'
}

class Analytics {
    client: PostHog | undefined;
    packageVersion: string | undefined;

    constructor() {
        try {
            if (process.env['TELEMETRY']?.toLowerCase() !== 'false' && !isStaging()) {
                this.client = new PostHog('phc_4S2pWFTyPYT1i7zwC8YYQqABvGgSAzNHubUkdEFvcTl');
                this.client.enable();
                this.packageVersion = JSON.parse(readFileSync(path.resolve(dirname(), '../../../package.json'), 'utf8')).version;
            }
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.ANALYTICS
            });
        }
    }

    public async track(name: string, accountId: number, eventProperties?: Record<string | number, any>, userProperties?: Record<string | number, any>) {
        try {
            if (this.client == null) {
                return;
            }

            eventProperties = eventProperties || {};
            userProperties = userProperties || {};

            const baseUrl = getBaseUrl();
            const userType = this.getUserType(accountId, baseUrl);
            const userId = this.getUserIdWithType(userType, accountId, baseUrl);

            eventProperties['host'] = baseUrl;
            eventProperties['user-type'] = userType;
            eventProperties['user-account'] = userId;
            eventProperties['nango-server-version'] = this.packageVersion || 'unknown';

            if (isCloud() && accountId != null) {
                const account: Account | null = await accountService.getAccountById(accountId);
                if (account !== null && account.id !== undefined) {
                    const users: User[] | null = await userService.getUsersByAccountId(account.id);

                    if (users) {
                        userProperties['email'] = users.map((user) => user.email).join(',');
                        userProperties['name'] = users.map((user) => user.name).join(',');
                    }
                }
            }

            userProperties['user-type'] = userType;
            userProperties['account'] = userId;
            eventProperties['$set'] = userProperties;

            this.client.capture({
                event: name,
                distinctId: userId,
                properties: eventProperties
            });
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.ANALYTICS,
                accountId: accountId
            });
        }
    }

    public async trackByEnvironmentId(
        name: string,
        environmentId: number,
        eventProperties?: Record<string | number, any>,
        userProperties?: Record<string | number, any>
    ) {
        const accountId = await environmentService.getAccountIdFromEnvironment(environmentId);
        if (accountId) {
            this.track(name, accountId as number, eventProperties, userProperties);
        }
    }

    public getUserType(accountId: number, baseUrl: string): UserType {
        if (baseUrl === localhostUrl) {
            return UserType.Local;
        } else if (accountId === 0) {
            return UserType.SelfHosted;
        } else {
            return UserType.Cloud;
        }
    }

    public getUserIdWithType(userType: string, accountId: number, baseUrl: string): string {
        switch (userType) {
            case UserType.Local:
                return `${userType}-${ip.address()}`;
            case UserType.SelfHosted:
                return `${userType}-${baseUrl}`;
            case UserType.Cloud:
                return `${userType}-${(accountId || 0).toString()}`;
            default:
                return 'unknown';
        }
    }
}

export default new Analytics();
