import db, { schema, dbNamespace } from '@nangohq/database';
import type { ServiceResponse } from '../../models/Generic.js';
import environmentService from '../environment.service.js';
import { basePublicUrl, getLogger, stringToHash, truncateJson } from '@nangohq/utils';
import connectionService from '../connection.service.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Orchestrator } from '../../clients/orchestrator.js';
import type { ConnectionJobs, DBConnection, DBSlackNotification } from '@nangohq/types';

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

interface SlackActionResponse {
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
    private orchestrator: Orchestrator;
    private logContextGetter: LogContextGetter;

    private actionName = 'flow-result-notifier-action';
    private integrationKey = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
    private nangoAdminUUID = process.env['NANGO_ADMIN_UUID'];
    private env = 'prod';

    // WARNING: disabling slack notifications while investigating sync issues
    private disabled = true;

    constructor({ orchestrator, logContextGetter }: { orchestrator: Orchestrator; logContextGetter: LogContextGetter }) {
        this.orchestrator = orchestrator;
        this.logContextGetter = logContextGetter;
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
    async reportFailure(nangoConnection: ConnectionJobs, name: string, type: string, originalActivityLogId: string, provider: string) {
        // WARNING: disabling slack notifications while investigating sync issues
        if (this.disabled) {
            return;
        }

        if (name === this.actionName) {
            return;
        }

        const accountEnv = await environmentService.getAccountAndEnvironment({ environmentId: nangoConnection.environment_id });
        if (!accountEnv) {
            throw new Error('failed_to_get_account');
        }

        const { account, environment } = accountEnv;
        if (!environment.slack_notifications) {
            return;
        }

        const { success, error, response: slackNotificationStatus } = await this.addFailingConnection(nangoConnection, name, type);

        // this must mean we don't want to trigger the slack notification
        // b/c it is auth and we don't increment the connection count
        if (success && !slackNotificationStatus) {
            return;
        }

        const adminEnvironment = await environmentService.getAccountAndEnvironment({ accountUuid: this.nangoAdminUUID!, envName: this.env });
        if (!adminEnvironment) {
            throw new Error('failed_to_get_admin_env');
        }

        const slackConnectionId = generateSlackConnectionId(account.uuid, environment.name);

        // we get the connection on the nango admin account to be able to send the notification
        const {
            success: connectionSuccess,
            error: slackConnectionError,
            response: slackConnection
        } = await connectionService.getConnection(slackConnectionId, this.integrationKey, adminEnvironment.environment.id);

        if (!connectionSuccess || !slackConnection) {
            logger.error(slackConnectionError);
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
                providerConfigKey: nangoConnection.provider_config_key,
                envName: environment.name,
                originalActivityLogId,
                date,
                resolved: false
            }),
            status: 'open',
            providerConfigKey: nangoConnection.provider_config_key,
            provider
        };

        const logCtx = await this.logContextGetter.create(
            { operation: { type: 'action', action: 'run' } },
            {
                account: adminEnvironment.account,
                environment: adminEnvironment.environment,
                integration: { id: slackConnection.config_id, name: slackConnection.provider_config_key, provider: 'slack' },
                connection: { id: slackConnection.id, name: slackConnection.connection_id },
                meta: truncateJson({ input: payload })
            }
        );

        void logCtx.info(`Sending notification for connection ${nangoConnection.connection_id}`);

        if (!success || !slackNotificationStatus) {
            void logCtx.error('Failed looking up the slack notification using the slack notification service', { error });
            await logCtx.failed();

            return;
        }

        if (slackNotificationStatus.slack_timestamp) {
            payload.ts = slackNotificationStatus.slack_timestamp;
        }

        try {
            const actionResponse = await this.orchestrator.triggerAction<SlackActionResponse>({
                connection: slackConnection,
                actionName: this.actionName,
                input: payload,
                logCtx
            });

            if (actionResponse.isOk() && actionResponse.value.ts) {
                const res = actionResponse.value;
                await this.updateNotificationWithTimestamp(slackNotificationStatus.id, res.ts);
                void logCtx.info(`Posted to https://slack.com/archives/${res.channel}/p${res.ts.replace('.', '')}`);
            }

            if (actionResponse.isOk()) {
                void logCtx.info(
                    `The action ${this.actionName} was successfully triggered for the ${flowType} ${name} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`,
                    { payload }
                );
                await logCtx.success();
            } else {
                void logCtx.error(
                    `The action ${this.actionName} failed to trigger for the ${flowType} ${name} with the error: ${actionResponse.error.message} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`,
                    { error: actionResponse.error, payload }
                );
                await logCtx.failed();
            }
        } catch (err) {
            void logCtx.error('Failed to trigger slack notification', { error: err });
            await logCtx.failed();
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
    async reportResolution(
        nangoConnection: ConnectionJobs,
        syncName: string,
        type: string,
        originalActivityLogId: string | null,
        provider: string,
        slack_timestamp: string,
        connectionCount: number
    ) {
        // WARNING: disabling slack notifications while investigating sync issues
        if (this.disabled) {
            return;
        }

        if (syncName === this.actionName) {
            return;
        }

        const accountEnv = await environmentService.getAccountAndEnvironment({ environmentId: nangoConnection.environment_id });
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
                name: syncName,
                providerConfigKey: nangoConnection.provider_config_key,
                envName: environment.name,
                originalActivityLogId,
                date: new Date(),
                resolved: true
            });
        } else {
            const count = connectionCount;
            const connection = count === 1 ? 'connection' : 'connections';
            payloadContent = this.getMessage({
                type,
                count,
                connectionWord: connection,
                flowType: type,
                name: syncName,
                providerConfigKey: nangoConnection.provider_config_key,
                envName: environment.name,
                originalActivityLogId,
                date: new Date(),
                resolved: false
            });
        }

        const payload: NotificationPayload = {
            content: payloadContent,
            status: connectionCount === 0 ? 'closed' : 'open',
            providerConfigKey: nangoConnection.provider_config_key,
            provider,
            ts: slack_timestamp
        };

        const adminEnvironment = await environmentService.getAccountAndEnvironment({ accountUuid: this.nangoAdminUUID!, envName: this.env });
        if (!adminEnvironment) {
            throw new Error('failed_to_get_admin_env');
        }

        const slackConnectionId = generateSlackConnectionId(account.uuid, environment.name);
        const { success: connectionSuccess, response: slackConnection } = await connectionService.getConnection(
            slackConnectionId,
            this.integrationKey,
            adminEnvironment.environment.id
        );

        if (!connectionSuccess || !slackConnection) {
            return;
        }

        const logCtx = await this.logContextGetter.create(
            { operation: { type: 'action', action: 'run' } },
            {
                account: adminEnvironment.account,
                environment: adminEnvironment.environment,
                integration: { id: slackConnection.config_id, name: slackConnection.provider_config_key, provider: 'slack' },
                connection: { id: slackConnection.id, name: slackConnection.connection_id },
                meta: truncateJson({ input: payload })
            }
        );

        void logCtx.info(`Sending notification for connection ${nangoConnection.connection_id}`);

        try {
            const actionResponse = await this.orchestrator.triggerAction<SlackActionResponse>({
                connection: slackConnection,
                actionName: this.actionName,
                input: payload,
                logCtx
            });

            if (actionResponse.isOk() && actionResponse.value.ts) {
                const res = actionResponse.value;
                void logCtx.info(`Posted to https://slack.com/archives/${res.channel}/p${res.ts.replace('.', '')}`);
            }

            const content = actionResponse.isOk()
                ? `The action ${this.actionName} was successfully triggered for the ${type} ${syncName} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`
                : `The action ${this.actionName} failed to trigger for the ${type} ${syncName} with the error: ${actionResponse.error.message} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`;

            if (actionResponse.isOk()) {
                void logCtx.info(content, payload);
                await logCtx.success();
            } else {
                void logCtx.error(content, { error: actionResponse.error });
                await logCtx.failed();
            }
        } catch (err) {
            void logCtx.error('Failed to trigger slack notification', { error: err });
            await logCtx.failed();
        }
    }

    /**
     * Has Open Notification
     * @desc Check if there is an open notification for the given name
     * and environment id and if so return the necessary information to be able
     * to update the notification.
     */
    async hasOpenNotification(
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
    async createNotification(
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
    async addFailingConnection(nangoConnection: ConnectionJobs, name: string, type: string): Promise<ServiceResponse<NotificationResponse>> {
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

            logger.info(`Notifying ${nangoConnection.id} type:${type} name:${name}`);

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
            const slackNotificationsEnabled = await environmentService.getSlackNotificationsEnabled(nangoConnection.environment_id);
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
