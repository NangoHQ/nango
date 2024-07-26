import { PostHog } from 'posthog-node';
import { localhostUrl, isCloud, isStaging, baseUrl } from '@nangohq/utils';
import { UserType } from '../utils/utils.js';
import errorManager, { ErrorSourceEnum } from './error.manager.js';
import accountService from '../services/account.service.js';
import environmentService from '../services/environment.service.js';
import userService from '../services/user.service.js';
import type { User } from '../models/Admin.js';
import { LogActionEnum } from '../models/Telemetry.js';
import { NANGO_VERSION } from '../version.js';
import type { DBTeam } from '@nangohq/types';

export enum AnalyticsTypes {
    ACCOUNT_CREATED = 'server:account_created',
    ACCOUNT_JOINED = 'server:account_joined',
    API_CONNECTION_INSERTED = 'server:api_key_connection_inserted',
    API_CONNECTION_UPDATED = 'server:api_key_connection_updated',
    TBA_CONNECTION_INSERTED = 'server:tba_connection_inserted',
    TABLEAU_CONNECTION_INSERTED = 'server:tableau_connection_inserted',
    CONFIG_CREATED = 'server:config_created',
    CONNECTION_INSERTED = 'server:connection_inserted',
    CONNECTION_LIST_FETCHED = 'server:connection_list_fetched',
    CONNECTION_UPDATED = 'server:connection_updated',
    DEMO_0 = 'demo:step_0',
    DEMO_1 = 'demo:step_1',
    DEMO_1_ERR = 'demo:step_1:error',
    DEMO_1_SUCCESS = 'demo:step_1:success',
    DEMO_2 = 'demo:step_2',
    DEMO_2_ERR = 'demo:step_2:error',
    DEMO_2_SUCCESS = 'demo:step_2:success',
    DEMO_3 = 'demo:step_3',
    DEMO_4 = 'demo:step_4',
    DEMO_4_ERR = 'demo:step_4:error',
    DEMO_4_SUCCESS = 'demo:step_4:success',
    DEMO_5 = 'demo:step_5',
    DEMO_5_ERR = 'demo:step_5:error',
    DEMO_5_SUCCESS = 'demo:step_5:success',
    DEMO_6 = 'demo:step_6',
    PRE_API_KEY_AUTH = 'server:pre_api_key_auth',
    PRE_APP_AUTH = 'server:pre_appauth',
    PRE_APP_STORE_AUTH = 'server:pre_app_store_auth',
    PRE_BASIC_API_KEY_AUTH = 'server:pre_basic_api_key_auth',
    PRE_UNAUTH = 'server:pre_unauth',
    PRE_WS_OAUTH = 'server:pre_ws_oauth',
    PRE_OAUTH2_CC_AUTH = 'server:pre_oauth2_cc_auth',
    PRE_TBA_AUTH = 'server:pre_tba_auth',
    RESOURCE_CAPPED_CONNECTION_CREATED = 'server:resource_capped:connection_creation',
    RESOURCE_CAPPED_CONNECTION_IMPORTED = 'server:resource_capped:connection_imported',
    RESOURCE_CAPPED_SCRIPT_ACTIVATE = 'server:resource_capped:script_activate',
    RESOURCE_CAPPED_SCRIPT_DEPLOY_IS_DISABLED = 'server:resource_capped:script_deploy_is_disabled',
    SYNC_DEPLOY_SUCCESS = 'sync:deploy_succeeded',
    SYNC_PAUSE = 'sync:command_pause',
    SYNC_RUN = 'sync:command_run',
    SYNC_UNPAUSE = 'sync:command_unpause',
    SYNC_CANCEL = 'sync:command_cancel',
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
            if (process.env['TELEMETRY']?.toLowerCase() !== 'false' && !isStaging) {
                this.client = new PostHog('phc_4S2pWFTyPYT1i7zwC8YYQqABvGgSAzNHubUkdEFvcTl');
                this.client.enable();
                this.packageVersion = NANGO_VERSION;
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

            const userType = this.getUserType(accountId, baseUrl);
            const userId = this.getUserIdWithType(userType, accountId, baseUrl);

            eventProperties['host'] = baseUrl;
            eventProperties['user-type'] = userType;
            eventProperties['user-account'] = userId;
            eventProperties['nango-server-version'] = this.packageVersion || 'unknown';

            if (isCloud && accountId != null) {
                const account: DBTeam | null = await accountService.getAccountById(accountId);
                if (account !== null && account.id !== undefined) {
                    const users: User[] = await userService.getUsersByAccountId(account.id);

                    if (users.length > 0) {
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
        if (typeof accountId !== 'undefined' && accountId !== null) {
            return this.track(name, accountId, eventProperties, userProperties);
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
                return `${userType}-local`;
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
