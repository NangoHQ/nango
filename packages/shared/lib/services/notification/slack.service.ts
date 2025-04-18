import db, { schema, dbNamespace } from '@nangohq/database';
import type { ServiceResponse } from '../../models/Generic.js';
import environmentService from '../environment.service.js';
import type { Result } from '@nangohq/utils';
import { basePublicUrl, Err, getLogger, Ok, stringToHash, truncateJson } from '@nangohq/utils';
import connectionService from '../connection.service.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { ConnectionJobs, DBConnection, DBConnectionDecrypted, DBEnvironment, DBSlackNotification, DBTeam } from '@nangohq/types';
import type { NangoError } from '../../utils/error.js';
import { refreshOrTestCredentials } from '../connections/credentials/refresh.js';
import configService from '../config.service.js';
import { ProxyRequest } from '../proxy/request.js';
import { getProxyConfiguration } from '../proxy/utils.js';
import type { Config } from '../../models/Provider.js';
import type { FeatureFlags } from '@nangohq/kvstore';

const logger = getLogger('SlackService');
const TABLE = dbNamespace + 'slack_notifications';

interface NotificationResponse {
    id: number;
    isOpen: boolean;
    connectionCount: number;
    slack_timestamp?: string;
    admin_slack_timestamp?: string;
}

interface NotificationPayload {
    content: string;
    meta?: {
        accountName: string;
        accountUuid: string;
    };
    providerConfigKey: string;
    provider: string;
    status: string;
    ts?: string;
}

interface PostSlackMessageResponse {
    ok: boolean;
    channel: string;
    ts: string;
    message: {
        bot_id: string;
        type: string;
        text: string;
        user: string;
        ts: string;
        app_id: string;
        team: string;
        bot_profile: {
            id: string;
            app_id: string;
            name: string;
            icons: any;
            deleted: boolean;
            updated: number;
            team_id: string;
        };
        attachments: any[];
    };
    warning?: string;
    response_metadata: {
        warnings: string[];
    };
}

export const generateSlackConnectionId = (accountUUID: string, environmentName: string) => `account-${accountUUID}-${environmentName}`;

/**
 * _nango_slack_notifications
 * @desc persistence layer for slack notifications and the connection list
 * to be able to trigger or resolve notifications
 *
 *  index:
 *      - open
 *      - environment_id
 *      - name
 */

export class SlackService {
    private logContextGetter: LogContextGetter;
    private featureFlags: FeatureFlags;

    private integrationKey = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
    private nangoAdminUUID = process.env['NANGO_ADMIN_UUID'];
    private env = 'prod';

    constructor({ logContextGetter, featureFlags }: { logContextGetter: LogContextGetter; featureFlags: FeatureFlags }) {
        this.logContextGetter = logContextGetter;
        this.featureFlags = featureFlags;
    }

    private async isDisabled() {
        return this.featureFlags.isSet('disable-slack-notifications');
    }

    /**
     * Update Notification with Timestamp
     * @desc used to keep the slack_timestamp up to date to be able to
     * send updates to the original notification
     */
    private async updateNotificationWithTimestamp(id: number, ts: string) {
        await schema()
            .from<DBSlackNotification>(TABLE)
            .update({
                slack_timestamp: ts
            })
            .where('id', id);
    }

    /**
     * Report Failure
     * @desc
     *      1) if slack notifications are enabled and the name is not itself (to avoid an infinite loop)
     *      add the connection to the notification list, grab the connection information
     *      of the admin slack notification action and send the notification to the slack channel
     *      by triggering the action.
     *      2) Update the notification record with the slack timestamp
     *      so future notifications can be sent as updates to the original.
     *      3) Add an activity log entry for the notification to the admin account
     */
    async reportFailure({
        account,
        environment,
        provider,
        name,
        connection,
        type,
        originalActivityLogId
    }: {
        account: DBTeam;
        environment: DBEnvironment;
        connection: ConnectionJobs;
        name: string;
        type: string;
        originalActivityLogId: string;
        provider: string;
    }) {
        if (await this.isDisabled()) {
            return;
        }

        if (!environment.slack_notifications) {
            return;
        }

        const { success, error, response: slackNotificationStatus } = await this.addFailingConnection(connection, name, type);

        // this must mean we don't want to trigger the slack notification
        // b/c it is auth and we don't increment the connection count
        if (success && !slackNotificationStatus) {
            return;
        }

        const count = slackNotificationStatus?.connectionCount || 0;
        const connectionWord = count === 1 ? 'connection' : 'connections';
        const flowType = type;
        const date = new Date();
        const payload: NotificationPayload = {
            content: this.getMessage({
                type,
                count,
                connectionWord,
                flowType,
                name,
                providerConfigKey: connection.provider_config_key,
                envName: environment.name,
                originalActivityLogId,
                date,
                resolved: false
            }),
            status: 'open',
            providerConfigKey: connection.provider_config_key,
            provider,
            ...(slackNotificationStatus?.slack_timestamp ? { ts: slackNotificationStatus.slack_timestamp } : {})
        };

        const res = await this.sendSlackNotification({ account, environment, type, name, connection, payload, lookupError: error });

        if (res.isOk() && slackNotificationStatus) {
            await this.updateNotificationWithTimestamp(slackNotificationStatus.id, res.value.ts);
        }
    }

    /**
     * Report Resolution
     * @desc
     *      1) if there are no more connections that are failing then send
     *      a resolution notification to the slack channel, otherwise update the message
     *      with the decremented connection count.
     *      2) Add an activity log entry for the notification to the admin account
     *
     */
    private async reportResolution(
        connection: ConnectionJobs,
        name: string,
        type: string,
        originalActivityLogId: string | null,
        provider: string,
        slack_timestamp: string,
        connectionCount: number
    ) {
        if (await this.isDisabled()) {
            return;
        }

        const accountEnv = await environmentService.getAccountAndEnvironment({ environmentId: connection.environment_id });
        if (!accountEnv) {
            throw new Error('failed_to_get_account');
        }

        const { account, environment } = accountEnv;

        let payloadContent = '';

        if (connectionCount === 0) {
            payloadContent = this.getMessage({
                type,
                count: connectionCount,
                connectionWord: 'connections',
                flowType: type,
                name,
                providerConfigKey: connection.provider_config_key,
                envName: environment.name,
                originalActivityLogId,
                date: new Date(),
                resolved: true
            });
        } else {
            const count = connectionCount;
            const connectionWord = count === 1 ? 'connection' : 'connections';
            payloadContent = this.getMessage({
                type,
                count,
                connectionWord,
                flowType: type,
                name,
                providerConfigKey: connection.provider_config_key,
                envName: environment.name,
                originalActivityLogId,
                date: new Date(),
                resolved: false
            });
        }

        const payload: NotificationPayload = {
            content: payloadContent,
            status: connectionCount === 0 ? 'closed' : 'open',
            providerConfigKey: connection.provider_config_key,
            provider,
            ts: slack_timestamp
        };

        await this.sendSlackNotification({ account, environment, type, name, connection, payload });
    }

    /**
     * Has Open Notification
     * @desc Check if there is an open notification for the given name
     * and environment id and if so return the necessary information to be able
     * to update the notification.
     */
    private async hasOpenNotification(
        nangoConnection: Pick<DBConnection, 'environment_id'>,
        name: string,
        type: string,
        trx = db.knex
    ): Promise<DBSlackNotification | null> {
        const hasOpenNotification = await trx
            .select<DBSlackNotification>('*')
            .from<DBSlackNotification>(TABLE)
            .forUpdate()
            .where({
                open: true,
                environment_id: nangoConnection.environment_id,
                name,
                type
            })
            .first();

        return hasOpenNotification || null;
    }

    /**
     * Create Notification
     * @desc create a new notification for the given name and environment id
     * and return the id of the created notification.
     */
    private async createNotification(
        nangoConnection: Pick<DBConnection, 'id' | 'environment_id'>,
        name: string,
        type: string,
        trx = db.knex
    ): Promise<Pick<DBSlackNotification, 'id'> | null> {
        const result = await trx
            .from<DBSlackNotification>(TABLE)
            .insert({
                open: true,
                environment_id: nangoConnection.environment_id,
                name,
                type,
                connection_list: [nangoConnection.id]
            })
            .returning('id');

        if (result && result.length > 0 && result[0]) {
            return result[0];
        }

        return null;
    }

    /**
     * Add Failing Connection
     * @desc check if there is an open notification for the given name and environment id
     * and if so add the connection id to the connection list.
     */
    private async addFailingConnection(nangoConnection: ConnectionJobs, name: string, type: string): Promise<ServiceResponse<NotificationResponse>> {
        return await db.knex.transaction(async (trx) => {
            const lockKey = stringToHash(`${nangoConnection.environment_id}-${name}-${type}-add`);

            const { rows } = await trx.raw<{ rows: { lock_slack_add_connection: boolean }[] }>(
                `SELECT pg_try_advisory_xact_lock(?) as lock_slack_add_connection`,
                [lockKey]
            );

            if (!rows?.[0]?.lock_slack_add_connection) {
                logger.info(`addFailingConnection operation: ${lockKey} could not acquire lock, skipping`);
                return { success: true, error: null, response: null };
            }

            const isOpen = await this.hasOpenNotification(nangoConnection, name, type, trx);

            if (isOpen && type === 'auth') {
                return {
                    success: true,
                    error: null,
                    response: null
                };
            }

            logger.info(`Notifying connection:${nangoConnection.id} type:${type} name:${name}`);

            if (!isOpen) {
                const created = await this.createNotification(nangoConnection, name, type, trx);

                return {
                    success: true,
                    error: null,
                    response: {
                        id: created?.id as number,
                        isOpen: false,
                        connectionCount: 1
                    }
                };
            }

            const { id, connection_list } = isOpen;

            if (connection_list.includes(nangoConnection.id)) {
                return {
                    success: true,
                    error: null,
                    response: {
                        id,
                        isOpen: true,
                        slack_timestamp: isOpen.slack_timestamp as string,
                        admin_slack_timestamp: isOpen.admin_slack_timestamp as string,
                        connectionCount: connection_list.length
                    }
                };
            }

            connection_list.push(nangoConnection.id);

            await trx.from<DBSlackNotification>(TABLE).where({ id }).update({
                connection_list,
                updated_at: new Date()
            });

            return {
                success: true,
                error: null,
                response: {
                    id,
                    isOpen: true,
                    slack_timestamp: isOpen.slack_timestamp as string,
                    admin_slack_timestamp: isOpen.admin_slack_timestamp as string,
                    connectionCount: connection_list.length
                }
            };
        });
    }

    /**
     * Remove Failing Connection
     * @desc check if there is an open notification for the given name and environment id
     * and if so remove the connection id from the connection list and report
     * resolution to the slack channel.
     */

    async removeFailingConnection({
        connection: nangoConnection,
        name,
        type,
        originalActivityLogId,
        provider
    }: {
        connection: ConnectionJobs;
        name: string;
        type: string;
        originalActivityLogId: string | null;
        provider: string;
    }): Promise<void> {
        const update = await db.knex.transaction(async (trx) => {
            const slackNotificationsEnabled = await environmentService.getSlackNotificationsEnabled(nangoConnection.environment_id, trx);
            if (!slackNotificationsEnabled) {
                return;
            }

            const lockKey = stringToHash(`${nangoConnection.environment_id}-${name}-${type}-remove`);

            const { rows } = await trx.raw<{ rows: { lock_slack_remove_connection: boolean }[] }>(
                `SELECT pg_try_advisory_xact_lock(?) as lock_slack_remove_connection`,
                [lockKey]
            );

            if (!rows?.[0]?.lock_slack_remove_connection) {
                logger.info(`removeFailingConnection operation: ${lockKey} could not acquire lock, skipping`);
                return;
            }

            const isOpen = await this.hasOpenNotification(nangoConnection, name, type, trx);
            if (!isOpen) {
                return;
            }

            const { id, connection_list, slack_timestamp, admin_slack_timestamp } = isOpen;

            const index = connection_list.indexOf(nangoConnection.id);
            if (index === -1) {
                return;
            }

            logger.info(`Resolving ${nangoConnection.id} type:${type} name:${name}`);

            connection_list.splice(index, 1);

            await trx
                .from<DBSlackNotification>(TABLE)
                .where({ id })
                .update({
                    open: connection_list.length > 0,
                    connection_list,
                    updated_at: new Date()
                });
            return {
                id,
                slackTimestamp: slack_timestamp,
                adminSlackTimestamp: admin_slack_timestamp,
                connectionCount: connection_list.length
            };
        });

        if (update) {
            // we report resolution to the slack channel which could be either
            // 1) The slack notification is resolved, connection_list === 0
            // 2) The list of failing connections has been decremented
            await this.reportResolution(nangoConnection, name, type, originalActivityLogId, provider, update.slackTimestamp as string, update.connectionCount);
        }
    }

    async closeAllOpenNotificationsForEnv(environment_id: number): Promise<void> {
        await db.knex
            .from<DBSlackNotification>(TABLE)
            .where({
                environment_id,
                open: true
            })
            .update({
                open: false,
                updated_at: new Date()
            });
    }

    private getLogUrl({
        envName,
        originalActivityLogId,
        name,
        date,
        type
    }: {
        envName: string;
        originalActivityLogId: string | null;
        name: string;
        date: Date;
        type: string;
    }) {
        const usp = new URLSearchParams();

        if (originalActivityLogId) {
            usp.set('operationId', String(originalActivityLogId));
        }

        const from = new Date(date);
        from.setHours(0, 0);
        const to = new Date(date);
        to.setHours(23, 59);
        usp.set('from', from.toISOString());
        usp.set('to', to.toISOString());

        if (type === 'auth') {
            usp.set('connections', name);
        } else if (type === 'integration') {
            usp.set('integrations', name);
        } else {
            usp.set('syncs', name);
        }

        return `${basePublicUrl}/${envName}/logs?${usp.toString()}`;
    }

    private getPageUrl({ envName, providerConfigKey, name, type }: { envName: string; providerConfigKey: string; name: string; type: string }) {
        return `${basePublicUrl}/${envName}/${type}/${providerConfigKey}/${name}`;
    }

    private getMessage({
        type,
        count,
        connectionWord,
        flowType,
        name,
        providerConfigKey,
        envName,
        originalActivityLogId,
        date,
        resolved
    }: {
        type: string;
        count: number;
        connectionWord: string;
        flowType: string;
        name: string;
        providerConfigKey: string;
        envName: string;
        originalActivityLogId: string | null;
        date: Date;
        resolved: boolean;
    }): string {
        switch (type) {
            case 'sync':
            case 'action': {
                if (resolved) {
                    return `[Resolved] \`${name}\` ${flowType.toLowerCase()} (integration: \`${providerConfigKey}\`) in *${envName}* failed. Read <${this.getLogUrl({ envName, originalActivityLogId, name, date, type })}|logs>.`;
                } else {
                    return `\`${name}\` ${flowType.toLowerCase()} (integration: \`${providerConfigKey}\`) is failing for ${count} ${connectionWord} in *${envName}*. Read <${this.getLogUrl({ envName, originalActivityLogId, name, date, type })}|logs>.`;
                }
            }
            case 'auth': {
                if (resolved) {
                    return `[Resolved] connection <${this.getPageUrl({ envName, name, providerConfigKey, type: 'connections' })}|*${name}*> (integration: \`${providerConfigKey}\`) in *${envName}* refresh failed.`;
                } else {
                    return `Could not refresh token of connection <${this.getPageUrl({ envName, name, providerConfigKey, type: 'connections' })}|*${name}*> in *${envName}* (integration: \`${providerConfigKey}\`). Read <${this.getLogUrl({ envName, originalActivityLogId, name, date, type })}|logs>.`;
                }
            }
        }

        return '';
    }

    private async sendSlackNotification({
        account,
        environment,
        type,
        name,
        connection,
        payload,
        lookupError = null
    }: {
        account: DBTeam;
        environment: DBEnvironment;
        type: string;
        name: string;
        connection: ConnectionJobs;
        payload: NotificationPayload;
        lookupError?: NangoError | null;
    }): Promise<Result<PostSlackMessageResponse>> {
        const admin = await environmentService.getAccountAndEnvironment({ accountUuid: this.nangoAdminUUID!, envName: this.env });
        if (!admin) {
            return Err('failed_to_get_admin_env');
        }

        const integration = await configService.getProviderConfig(this.integrationKey, admin.environment.id);
        if (!integration) {
            return Err('failed_to_get_integration');
        }

        const slackConnectionId = generateSlackConnectionId(account.uuid, environment.name);

        // we get the connection on the nango admin account to be able to send the notification
        const {
            success: connectionSuccess,
            error: slackConnectionError,
            response: slackConnection
        } = await connectionService.getConnection(slackConnectionId, this.integrationKey, admin.environment.id);

        if (!connectionSuccess || !slackConnection) {
            logger.error(slackConnectionError);
            return Err('failed_to_get_slack_connection');
        }

        const logCtx = await this.logContextGetter.create(
            { operation: { type: 'proxy', action: 'call' } },
            {
                account: admin.account,
                environment: admin.environment,
                integration: { id: slackConnection.config_id, name: slackConnection.provider_config_key, provider: 'slack' },
                connection: { id: slackConnection.id, name: slackConnection.connection_id },
                meta: {
                    accountId: account.id,
                    accountName: account.name,
                    environment: environment.id,
                    environmentName: environment.name,
                    connectionId: connection.id,
                    connection: connection.connection_id,
                    type,
                    name,
                    input: truncateJson(payload)
                }
            }
        );

        if (lookupError) {
            void logCtx.error('Failed looking up slack notification', { error: lookupError });
            await logCtx.failed();
            return Err(lookupError);
        }

        const refreshedConnection = await refreshOrTestCredentials({
            connection: slackConnection,
            account: admin.account,
            environment: admin.environment,
            integration,
            instantRefresh: false,
            onRefreshSuccess: async () => {},
            onRefreshFailed: async () => {},
            logContextGetter: this.logContextGetter
        });
        if (refreshedConnection.isErr()) {
            void logCtx.error('Failed to refresh slack connection', { error: refreshedConnection.error });
            await logCtx.failed();
            return Err(refreshedConnection.error);
        }

        const res = await this.proxySlackMessage({ slackConnection: refreshedConnection.value, payload, integration });

        if (res.isErr()) {
            void logCtx.error(`Failed to send Slack notification`, { error: res.error });
            await logCtx.failed();
            return Err(res.error);
        }
        void logCtx.info(`Posted to https://slack.com/archives/${res.value.channel}/p${res.value.ts.replace('.', '')}`);
        await logCtx.success();
        return Ok(res.value);
    }

    private async proxySlackMessage({
        slackConnection,
        payload,
        integration
    }: {
        slackConnection: DBConnectionDecrypted;
        payload: NotificationPayload;
        integration: Config;
    }): Promise<Result<PostSlackMessageResponse>> {
        const color = payload.status === 'open' ? '#e01e5a' : '#36a64f';

        const channel = slackConnection.connection_config['incoming_webhook.channel_id'];

        if (!channel) {
            return Err('slack_hook_channel_id_not_configured');
        }

        // Join the Slack channel
        let proxyConfig = getProxyConfiguration({
            externalConfig: {
                method: 'POST' as const,
                endpoint: 'conversations.join',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                data: { channel },
                decompress: false,
                providerConfigKey: integration.unique_key
            },
            internalConfig: {
                providerName: integration.provider
            }
        });
        if (proxyConfig.isErr()) {
            return Err('failed_to_get_proxy_config');
        }
        let proxy = new ProxyRequest({
            logger: () => {},
            proxyConfig: proxyConfig.value,
            getConnection: () => slackConnection
        });
        const join = await proxy.request();
        if (join.isErr()) {
            return Err('slack_join_channel_failed');
        }
        if (!join.value.data.ok) {
            return Err(join.value.data.error);
        }

        // Send/update chat message
        const data = {
            channel,
            ts: payload.ts || '',
            attachments: [
                {
                    color: color,
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: payload.content
                            }
                        },
                        ...(payload.meta
                            ? [
                                  {
                                      type: 'context',
                                      elements: [
                                          {
                                              type: 'mrkdwn',
                                              text: `${payload.meta.accountName} (uuid: ${payload.meta.accountUuid})`
                                          }
                                      ]
                                  }
                              ]
                            : [])
                    ]
                }
            ]
        };

        proxyConfig = getProxyConfiguration({
            externalConfig: {
                method: 'POST' as const,
                endpoint: data.ts ? 'chat.update' : 'chat.postMessage',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                data,
                decompress: false,
                providerConfigKey: integration.unique_key,
                retries: 10
            },
            internalConfig: {
                providerName: integration.provider
            }
        });
        if (proxyConfig.isErr()) {
            return Err('failed_to_get_proxy_config');
        }
        proxy = new ProxyRequest({
            logger: () => {},
            proxyConfig: proxyConfig.value,
            getConnection: () => slackConnection
        });
        const slackMessage = await proxy.request();
        if (slackMessage.isErr()) {
            return Err('slack_post_failed');
        }

        return Ok(slackMessage.value.data as PostSlackMessageResponse);
    }

    public async closeOpenNotificationForConnection({ connectionId, environmentId }: { connectionId: number; environmentId: number }) {
        await db.knex.transaction(async (trx) => {
            const rows = await trx
                .select('*')
                .from<DBSlackNotification>(TABLE)
                .forUpdate()
                .where({
                    open: true,
                    environment_id: environmentId
                })
                .whereRaw(`connection_list && '{${connectionId}}'`);

            for (const row of rows) {
                const connectionIds = row.connection_list.filter((id) => id !== connectionId);

                await trx
                    .from<DBSlackNotification>(TABLE)
                    .where({ id: row.id })
                    .update({
                        open: connectionIds.length > 0,
                        connection_list: connectionIds,
                        updated_at: new Date()
                    });
            }
        });
    }
}
