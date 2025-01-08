import { PostHog } from 'posthog-node';
import { localhostUrl, isCloud, isStaging, baseUrl, getLogger } from '@nangohq/utils';
import { UserType } from '../utils/utils.js';
import errorManager, { ErrorSourceEnum } from './error.manager.js';
import accountService from '../services/account.service.js';
import environmentService from '../services/environment.service.js';
import userService from '../services/user.service.js';
import { LogActionEnum } from '../models/Telemetry.js';
import { NANGO_VERSION } from '../version.js';

const logger = getLogger('analytics');

export enum AnalyticsTypes {
    ACCOUNT_CREATED = 'server:account_created',
    ACCOUNT_JOINED = 'server:account_joined',
    API_CONNECTION_INSERTED = 'server:api_key_connection_inserted',
    API_CONNECTION_UPDATED = 'server:api_key_connection_updated',
    TBA_CONNECTION_INSERTED = 'server:tba_connection_inserted',
    TBA_CONNECTION_UPDATED = 'server:tba_connection_updated',
    TABLEAU_CONNECTION_INSERTED = 'server:tableau_connection_inserted',
    TABLEAU_CONNECTION_UPDATED = 'server:tableau_connection_updated',
    JWT_CONNECTION_INSERTED = 'server:jwt_connection_inserted',
    JWT_CONNECTION_UPDATED = 'server:jwt_connection_updated',
    BILL_CONNECTION_INSERTED = 'server:bill_connection_inserted',
    BILL_CONNECTION_UPDATED = 'server:bill_connection_updated',
    TWO_STEP_CONNECTION_INSERTED = 'server:two_step_connection_inserted',
    TWO_STEP_CONNECTION_UPDATED = 'server:two_step_connection_updated',
    SIGNATURE_CONNECTION_INSERTED = 'server:signature_connection_inserted',
    SIGNATURE_CONNECTION_UPDATED = 'server:signature_connection_updated',
    CONFIG_CREATED = 'server:config_created',
    CONNECTION_INSERTED = 'server:connection_inserted',
    CONNECTION_LIST_FETCHED = 'server:connection_list_fetched',
    CONNECTION_UPDATED = 'server:connection_updated',
    PRE_API_KEY_AUTH = 'server:pre_api_key_auth',
    PRE_APP_AUTH = 'server:pre_appauth',
    PRE_APP_STORE_AUTH = 'server:pre_app_store_auth',
    PRE_BASIC_API_KEY_AUTH = 'server:pre_basic_api_key_auth',
    PRE_UNAUTH = 'server:pre_unauth',
    PRE_WS_OAUTH = 'server:pre_ws_oauth',
    PRE_BILL_AUTH = 'server:pre_bill_auth',
    PRE_TWO_STEP_AUTH = 'server:pre_two_step_auth',
    PRE_OAUTH2_CC_AUTH = 'server:pre_oauth2_cc_auth',
    PRE_TBA_AUTH = 'server:pre_tba_auth',
    PRE_JWT_AUTH = 'server:pre_jwt_auth',
    PRE_SIGNATURE_AUTH = 'server:pre_signature_auth',
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

type OperationType = 'override' | 'creation';
type ProviderType = 'SIGNATURE' | 'TWO_STEP' | 'BILL' | 'JWT' | 'TABLEAU' | 'TBA' | 'API_KEY' | 'BASIC';

const AnalyticsEventMapping: Record<ProviderType, Record<OperationType, AnalyticsTypes>> = {
    TWO_STEP: {
        creation: AnalyticsTypes.TWO_STEP_CONNECTION_INSERTED,
        override: AnalyticsTypes.TWO_STEP_CONNECTION_UPDATED
    },
    SIGNATURE: {
        creation: AnalyticsTypes.SIGNATURE_CONNECTION_INSERTED,
        override: AnalyticsTypes.SIGNATURE_CONNECTION_UPDATED
    },
    BILL: {
        creation: AnalyticsTypes.BILL_CONNECTION_INSERTED,
        override: AnalyticsTypes.BILL_CONNECTION_UPDATED
    },
    JWT: {
        creation: AnalyticsTypes.JWT_CONNECTION_INSERTED,
        override: AnalyticsTypes.JWT_CONNECTION_UPDATED
    },
    TABLEAU: {
        creation: AnalyticsTypes.TABLEAU_CONNECTION_INSERTED,
        override: AnalyticsTypes.TABLEAU_CONNECTION_UPDATED
    },
    TBA: {
        creation: AnalyticsTypes.TBA_CONNECTION_INSERTED,
        override: AnalyticsTypes.TBA_CONNECTION_UPDATED
    },
    API_KEY: {
        creation: AnalyticsTypes.API_CONNECTION_INSERTED,
        override: AnalyticsTypes.API_CONNECTION_UPDATED
    },
    BASIC: {
        creation: AnalyticsTypes.API_CONNECTION_INSERTED,
        override: AnalyticsTypes.API_CONNECTION_UPDATED
    }
};

class Analytics {
    client: PostHog | undefined;
    packageVersion: string | undefined;

    constructor() {
        const hasTelemetry = process.env['TELEMETRY'] !== 'false' && !isStaging;
        if (!hasTelemetry) {
            return;
        }

        // hardcoded for OSS telemetry
        const key = process.env['PUBLIC_POSTHOG_KEY'] || 'phc_4S2pWFTyPYT1i7zwC8YYQqABvGgSAzNHubUkdEFvcTl';
        if (!key) {
            logger.error('No PostHog key');
            return;
        }

        try {
            this.client = new PostHog(key);
            this.client.enable();
            this.packageVersion = NANGO_VERSION;
        } catch (err) {
            errorManager.report(err, {
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
                const account = await accountService.getAccountById(accountId);
                if (account !== null && account.id !== undefined) {
                    const users = await userService.getUsersByAccountId(account.id);

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
        } catch (err) {
            errorManager.report(err, {
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

    public async trackConnectionEvent({
        provider_type,
        operation,
        accountId
    }: {
        provider_type: string;
        operation: OperationType;
        accountId: number;
    }): Promise<void> {
        const providerKey = provider_type as ProviderType;

        const eventType = AnalyticsEventMapping[providerKey][operation];

        await this.track(eventType, accountId, { provider_type });
    }
}

export default new Analytics();
