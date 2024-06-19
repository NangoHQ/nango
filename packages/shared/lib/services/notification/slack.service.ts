import db, { schema, dbNamespace } from '@nangohq/database';
import type { SlackNotification } from '../../models/SlackNotification.js';
import type { NangoConnection } from '../../models/Connection.js';
import type { ServiceResponse } from '../../models/Generic.js';
import environmentService from '../environment.service.js';
import type { LogLevel } from '../../models/Activity.js';
import { LogActionEnum } from '../../models/Activity.js';
import { updateSuccess as updateSuccessActivityLog, createActivityLogMessage, createActivityLog } from '../activity/activity.service.js';
import { basePublicUrl, getLogger } from '@nangohq/utils';
import connectionService from '../connection.service.js';
import accountService from '../account.service.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type { OrchestratorClientInterface } from '../../clients/orchestrator.js';
import { Orchestrator } from '../../clients/orchestrator.js';

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
    private adminConnectionId = process.env['NANGO_ADMIN_CONNECTION_ID'] || 'admin-slack';
    private integrationKey = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
    private nangoAdminUUID = process.env['NANGO_ADMIN_UUID'];
    private env = 'prod';

    constructor({ orchestratorClient, logContextGetter }: { orchestratorClient: OrchestratorClientInterface; logContextGetter: LogContextGetter }) {
        this.orchestrator = new Orchestrator(orchestratorClient);
        this.logContextGetter = logContextGetter;
    }

    /**
     * Get Nango Admin Connection
     * @desc get the admin connection information to be able to send a duplicate
     * notification to the Nango admin account
     */
    private async getNangoAdminConnection(): Promise<NangoConnection | null> {
        const info = await accountService.getAccountAndEnvironmentIdByUUID(this.nangoAdminUUID as string, this.env);

        const { success, response: slackConnection } = await connectionService.getConnection(
            this.adminConnectionId,
            this.integrationKey,
            info?.environmentId as number
        );

        if (!success || !slackConnection) {
            return null;
        }

        return slackConnection;
    }

    private async getAdminEnvironmentId(): Promise<number> {
        const info = await accountService.getAccountAndEnvironmentIdByUUID(this.nangoAdminUUID as string, this.env);

        return info?.environmentId as number;
    }

    /**
     * Send Duplicate Notification to Nango Admins
     * @desc append the account and environment information to the notification content,
     * add the payload timestamp if available and send the notification to the Nango Admins
     * and with the action response update the slack timestamp to the notification
     * record. This is so future notifications can be sent as updates to the original
     */
    private async sendDuplicateNotificationToNangoAdmins(
        payload: NotificationPayload,
        activityLogId: number,
        environment_id: number,
        logCtx: LogContext, // TODO: we should not reuse this ctx
        id?: number,
        ts?: string
    ) {
        const nangoAdminConnection = await this.getNangoAdminConnection();

        if (!nangoAdminConnection) {
            return;
        }

        const account = await environmentService.getAccountFromEnvironment(environment_id);
        if (!account) {
            throw new Error('failed_to_get_account');
        }

        payload.content = `${payload.content} [Account ${account.uuid} Environment ${environment_id}]`;

        if (ts) {
            payload.ts = ts;
        }

        const actionResponse = await this.orchestrator.triggerAction<SlackActionResponse>({
            connection: nangoAdminConnection,
            actionName: this.actionName,
            input: payload,
            activityLogId,
            environment_id: nangoAdminConnection?.environment_id,
            logCtx
        });

        if (id && actionResponse.isOk() && actionResponse.value.ts) {
            await this.updateNotificationWithAdminTimestamp(id, actionResponse.value.ts);
        }
    }

    /**
     * Update Notification with Timestamp
     * @desc used to keep the slack_timestamp up to date to be able to
     * send updates to the original notification
     */
    private async updateNotificationWithTimestamp(id: number, ts: string) {
        await schema()
            .from<SlackNotification>(TABLE)
            .update({
                slack_timestamp: ts
            })
            .where('id', id);
    }

    /**
     * Update Notification with Admin Timestamp
     * @desc used to keep the admin_slack_timestamp up to date to be able to
     * send updates to the original notification
     */
    private async updateNotificationWithAdminTimestamp(id: number, ts: string) {
        await schema()
            .from<SlackNotification>(TABLE)
            .update({
                admin_slack_timestamp: ts
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
     *      3) Send a duplicate notification to the Nango Admins
     *      4) Add an activity log entry for the notification to the admin account
     */
    async reportFailure(nangoConnection: NangoConnection, name: string, type: string, originalActivityLogId: number, environment_id: number, provider: string) {
        const slackNotificationsEnabled = await environmentService.getSlackNotificationsEnabled(nangoConnection.environment_id);

        if (!slackNotificationsEnabled) {
            return;
        }

        if (name === this.actionName) {
            return;
        }

        const envName = (await environmentService.getEnvironmentName(nangoConnection.environment_id))!;
        const { success, error, response: slackNotificationStatus } = await this.addFailingConnection(nangoConnection, name, type);

        const account = await environmentService.getAccountFromEnvironment(environment_id);
        if (!account) {
            throw new Error('failed_to_get_account');
        }

        const slackConnectionId = generateSlackConnectionId(account.uuid, envName);
        const nangoEnvironmentId = await this.getAdminEnvironmentId();

        // we get the connection on the nango admin account to be able to send the notification
        const {
            success: connectionSuccess,
            error: slackConnectionError,
            response: slackConnection
        } = await connectionService.getConnection(slackConnectionId, this.integrationKey, nangoEnvironmentId);

        if (!connectionSuccess || !slackConnection) {
            logger.error(slackConnectionError);
            return;
        }

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: LogActionEnum.ACTION,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: slackConnection?.connection_id,
            provider_config_key: slackConnection?.provider_config_key,
            provider: this.integrationKey,
            environment_id: slackConnection?.environment_id,
            operation_name: this.actionName
        };

        const activityLogId = await createActivityLog(log);
        const logCtx = await this.logContextGetter.create(
            { id: String(activityLogId), operation: { type: 'action' }, message: 'Start action' },
            {
                account,
                environment: { id: environment_id, name: envName },
                integration: { id: slackConnection.config_id!, name: slackConnection.provider_config_key, provider: 'slack' },
                connection: { id: slackConnection.id!, name: slackConnection.connection_id }
            }
        );

        if (!success || !slackNotificationStatus) {
            await createActivityLogMessage({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                content: `Failed looking up the slack notification using the slack notification service. The error was: ${error}`,
                timestamp: Date.now()
            });
            await logCtx.error('Failed looking up the slack notification using the slack notification service', { error });
            await logCtx.failed();

            return;
        }

        const count = slackNotificationStatus.connectionCount;
        const connectionWord = count === 1 ? 'connection' : 'connections';
        const flowType = type;
        const date = new Date();
        const payload: NotificationPayload = {
            content: this.getMessage({ type, count, connectionWord, flowType, name, envName, originalActivityLogId, date, resolved: false }),
            status: 'open',
            providerConfigKey: nangoConnection.provider_config_key,
            provider
        };

        if (slackNotificationStatus.slack_timestamp) {
            payload.ts = slackNotificationStatus.slack_timestamp;
        }

        try {
            const actionResponse = await this.orchestrator.triggerAction<SlackActionResponse>({
                connection: slackConnection as NangoConnection,
                actionName: this.actionName,
                input: payload,
                activityLogId: activityLogId as number,
                environment_id,
                logCtx
            });

            if (actionResponse.isOk() && actionResponse.value.ts) {
                await this.updateNotificationWithTimestamp(slackNotificationStatus.id, actionResponse.value.ts);
            }

            await this.sendDuplicateNotificationToNangoAdmins(
                payload,
                originalActivityLogId,
                environment_id,
                logCtx,
                slackNotificationStatus.id,
                slackNotificationStatus.admin_slack_timestamp
            );

            const content = actionResponse.isOk()
                ? `The action ${this.actionName} was successfully triggered for the ${flowType} ${name} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`
                : `The action ${this.actionName} failed to trigger for the ${flowType} ${name} with the error: ${actionResponse.error.message} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`;

            await createActivityLogMessage({
                level: actionResponse.isOk() ? 'info' : 'error',
                activity_log_id: activityLogId as number,
                environment_id: slackConnection?.environment_id,
                timestamp: Date.now(),
                content,
                params: payload as unknown as Record<string, unknown>
            });

            await updateSuccessActivityLog(activityLogId as number, actionResponse.isOk());

            if (actionResponse.isOk()) {
                await logCtx.info(
                    `The action ${this.actionName} was successfully triggered for the ${flowType} ${name} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`,
                    { payload }
                );
                await logCtx.success();
            } else {
                await logCtx.error(
                    `The action ${this.actionName} failed to trigger for the ${flowType} ${name} with the error: ${actionResponse.error.message} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`,
                    { error: actionResponse.error, payload }
                );
                await logCtx.failed();
            }
        } catch (error) {
            await logCtx.error('Failed to trigger slack notification', { error });
            await logCtx.failed();
        }
    }

    /**
     * Report Resolution
     * @desc
     *      1) if there are no more connections that are failing then send
     *      a resolution notification to the slack channel, otherwise update the message
     *      with the decremented connection count.
     *      2) Send a duplicate notification to the Nango Admins
     *      3) Add an activity log entry for the notification to the admin account
     *
     */
    async reportResolution(
        nangoConnection: NangoConnection,
        syncName: string,
        type: string,
        originalActivityLogId: number | null,
        environment_id: number,
        provider: string,
        slack_timestamp: string,
        admin_slack_timestamp: string,
        connectionCount: number
    ) {
        if (syncName === this.actionName) {
            return;
        }

        const envName = (await environmentService.getEnvironmentName(nangoConnection.environment_id))!;

        let payloadContent = '';

        if (connectionCount === 0) {
            payloadContent = this.getMessage({
                type,
                count: connectionCount,
                connectionWord: 'connections',
                flowType: type,
                name: syncName,
                envName,
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
                envName,
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

        const account = await environmentService.getAccountFromEnvironment(environment_id);
        if (!account) {
            throw new Error('failed_to_get_account');
        }

        const nangoEnvironmentId = await this.getAdminEnvironmentId();
        const slackConnectionId = generateSlackConnectionId(account.uuid, envName);
        const { success: connectionSuccess, response: slackConnection } = await connectionService.getConnection(
            slackConnectionId,
            this.integrationKey,
            nangoEnvironmentId
        );

        if (!connectionSuccess || !slackConnection) {
            return;
        }

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: LogActionEnum.ACTION,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: slackConnection?.connection_id,
            provider_config_key: slackConnection?.provider_config_key,
            provider: this.integrationKey,
            environment_id: slackConnection?.environment_id,
            operation_name: this.actionName
        };

        const activityLogId = await createActivityLog(log);
        const logCtx = await this.logContextGetter.create(
            { id: String(activityLogId), operation: { type: 'action' }, message: 'Start action' },
            {
                account,
                environment: { id: environment_id, name: envName },
                integration: { id: slackConnection.config_id!, name: slackConnection.provider_config_key, provider: 'slack' },
                connection: { id: slackConnection.id!, name: slackConnection.connection_id }
            }
        );

        try {
            const actionResponse = await this.orchestrator.triggerAction<SlackActionResponse>({
                connection: slackConnection as NangoConnection,
                actionName: this.actionName,
                input: payload,
                activityLogId: activityLogId as number,
                environment_id,
                logCtx
            });

            await this.sendDuplicateNotificationToNangoAdmins(payload, activityLogId as number, environment_id, logCtx, undefined, admin_slack_timestamp);

            const content = actionResponse.isOk()
                ? `The action ${this.actionName} was successfully triggered for the ${type} ${syncName} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`
                : `The action ${this.actionName} failed to trigger for the ${type} ${syncName} with the error: ${actionResponse.error.message} for environment ${slackConnection?.environment_id} for account ${account.uuid}.`;

            await createActivityLogMessage({
                level: actionResponse.isOk() ? 'info' : 'error',
                activity_log_id: activityLogId as number,
                environment_id: slackConnection?.environment_id,
                timestamp: Date.now(),
                content,
                params: payload as unknown as Record<string, unknown>
            });

            await updateSuccessActivityLog(activityLogId as number, actionResponse.isOk());
            if (actionResponse.isOk()) {
                await logCtx.info(content, payload);
                await logCtx.success();
            } else {
                await logCtx.error(content, { error: actionResponse.error });
                await logCtx.failed();
            }
        } catch (error) {
            await logCtx.error('Failed to trigger slack notification', { error });
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
        nangoConnection: NangoConnection,
        name: string
    ): Promise<Pick<SlackNotification, 'id' | 'connection_list' | 'slack_timestamp' | 'admin_slack_timestamp'> | null> {
        const hasOpenNotification = await schema()
            .select('id', 'connection_list', 'slack_timestamp', 'admin_slack_timestamp')
            .from<SlackNotification>(TABLE)
            .where({
                open: true,
                environment_id: nangoConnection.environment_id,
                name
            });

        if (!hasOpenNotification || !hasOpenNotification.length) {
            return null;
        }

        return hasOpenNotification[0];
    }

    /**
     * Create Notification
     * @desc create a new notification for the given name and environment id
     * and return the id of the created notification.
     */
    async createNotification(nangoConnection: NangoConnection, name: string, type: string): Promise<Pick<SlackNotification, 'id'> | null> {
        const result = await schema()
            .from<SlackNotification>(TABLE)
            .insert({
                open: true,
                environment_id: nangoConnection.environment_id,
                name,
                type,
                connection_list: [nangoConnection.id as number]
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
    async addFailingConnection(nangoConnection: NangoConnection, name: string, type: string): Promise<ServiceResponse<NotificationResponse>> {
        const isOpen = await this.hasOpenNotification(nangoConnection, name);

        logger.info(`Notifying ${nangoConnection.id} type:${type} name:${name}`);
        if (!isOpen) {
            const created = await this.createNotification(nangoConnection, name, type);

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

        if (connection_list.includes(nangoConnection.id as number)) {
            return {
                success: true,
                error: null,
                response: {
                    id: id as number,
                    isOpen: true,
                    slack_timestamp: isOpen.slack_timestamp as string,
                    admin_slack_timestamp: isOpen.admin_slack_timestamp as string,
                    connectionCount: connection_list.length
                }
            };
        }

        connection_list.push(nangoConnection.id as number);

        await schema()
            .from<SlackNotification>(TABLE)
            .where({ id: id as number })
            .update({
                connection_list,
                updated_at: new Date()
            });

        return {
            success: true,
            error: null,
            response: {
                id: id as number,
                isOpen: true,
                slack_timestamp: isOpen.slack_timestamp as string,
                admin_slack_timestamp: isOpen.admin_slack_timestamp as string,
                connectionCount: connection_list.length
            }
        };
    }

    /**
     * Remove Failing Connection
     * @desc check if there is an open notification for the given name and environment id
     * and if so remove the connection id from the connection list and report
     * resolution to the slack channel.
     */

    async removeFailingConnection(
        nangoConnection: NangoConnection,
        name: string,
        type: string,
        originalActivityLogId: number | null,
        environment_id: number,
        provider: string
    ): Promise<void> {
        const slackNotificationsEnabled = await environmentService.getSlackNotificationsEnabled(nangoConnection.environment_id);

        if (!slackNotificationsEnabled) {
            return;
        }

        const isOpen = await this.hasOpenNotification(nangoConnection, name);

        if (!isOpen) {
            return;
        }

        const { id, connection_list, slack_timestamp, admin_slack_timestamp } = isOpen;

        const index = connection_list.indexOf(nangoConnection.id as number);
        if (index === -1) {
            return;
        }

        logger.info(`Resolving ${nangoConnection.id} type:${type} name:${name}`);

        connection_list.splice(index, 1);

        await db.knex
            .from<SlackNotification>(TABLE)
            .where({ id: id as number })
            .update({
                open: connection_list.length > 0,
                connection_list,
                updated_at: new Date()
            });

        // we report resolution to the slack channel which could be either
        // 1) The slack notification is resolved, connection_list === 0
        // 2) The list of failing connections has been decremented
        await this.reportResolution(
            nangoConnection,
            name,
            type,
            originalActivityLogId,
            environment_id,
            provider,
            slack_timestamp as string,
            admin_slack_timestamp as string,
            connection_list.length
        );
    }

    async closeAllOpenNotifications(environment_id: number): Promise<void> {
        await schema()
            .from<SlackNotification>(TABLE)
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
        originalActivityLogId: number | null;
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
        } else {
            usp.set('syncs', name);
        }

        return `${basePublicUrl}/${envName}/logs?${usp.toString()}`;
    }

    private getMessage({
        type,
        count,
        connectionWord,
        flowType,
        name,
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
        envName: string;
        originalActivityLogId: number | null;
        date: Date;
        resolved: boolean;
    }): string {
        switch (type) {
            case 'sync':
            case 'action': {
                if (resolved) {
                    return `[Resolved] *${name}* (${flowType.toLowerCase()}) in *${envName}* failed. Read <${this.getLogUrl({ envName, originalActivityLogId, name, date, type })}|logs>.`;
                } else {
                    return `*${name}* (${flowType.toLowerCase()}) is failing for ${count} ${connectionWord} in *${envName}*. Read <${this.getLogUrl({ envName, originalActivityLogId, name, date, type })}|logs>.`;
                }
            }
            case 'auth': {
                if (resolved) {
                    return `[Resolved] connection *${name}* in *${envName}* refresh failed.`;
                } else {
                    return `Could not refresh token of connection *${name}* in *${envName}*. Read <${this.getLogUrl({ envName, originalActivityLogId, name, date, type })}|logs>.`;
                }
            }
        }

        return '';
    }
}
