import { schema, dbNamespace } from '../../../db/database.js';
import type { SlackNotification } from '../../../models/SlackNotification';
import type { NangoConnection } from '../../../models/Connection';
import type { ServiceResponse } from '../../../models/Generic';
import { SyncType, SyncConfigType } from '../../../models/Sync.js';
import environmentService from '../../environment.service.js';
import { LogActionEnum, LogLevel } from '../../../models/Activity.js';
import { updateSuccess as updateSuccessActivityLog, createActivityLogMessage, createActivityLog } from '../../activity/activity.service.js';
import { getBasePublicUrl } from '../../../utils/utils.js';
import connectionService from '../../connection.service.js';
import accountService from '../../account.service.js';
import SyncClient from '../../../clients/sync.client.js';

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

class SlackService {
    private actionName = 'flow-result-notifier-action';
    private adminConnectionId = process.env['NANGO_ADMIN_CONNECTION_ID'] || 'admin-slack';
    private integrationKey = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
    private nangoAdminUUID = process.env['NANGO_ADMIN_UUID'];
    private env = 'prod';

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
        originalActivityLogId: number,
        environment_id: number,
        id?: number,
        ts?: string
    ) {
        const nangoAdminConnection = await this.getNangoAdminConnection();

        if (!nangoAdminConnection) {
            return;
        }

        const syncClient = await SyncClient.getInstance();

        const accountUUID = await environmentService.getAccountUUIDFromEnvironment(environment_id);
        payload.content = `${payload.content} [Account ${accountUUID} Environment ${environment_id}]`;

        if (ts) {
            payload.ts = ts;
        }

        const { response } = (await syncClient?.triggerAction<SlackActionResponse>(
            nangoAdminConnection as NangoConnection,
            this.actionName,
            payload,
            originalActivityLogId,
            nangoAdminConnection?.environment_id as number,
            false
        )) as ServiceResponse<SlackActionResponse>;

        if (id && response) {
            await this.updateNotificationWithAdminTimestamp(id, response.ts);
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
    async reportFailure(
        nangoConnection: NangoConnection,
        syncName: string,
        syncType: SyncType,
        originalActivityLogId: number,
        environment_id: number,
        provider: string
    ) {
        const slackNotificationsEnabled = await environmentService.getSlackNotificationsEnabled(nangoConnection.environment_id);

        if (!slackNotificationsEnabled) {
            return;
        }

        if (syncName === this.actionName) {
            return;
        }

        const { success, error, response: slackNotificationStatus } = await this.addFailingConnection(nangoConnection, syncName, syncType);

        const accountUUID = await environmentService.getAccountUUIDFromEnvironment(environment_id);
        const slackConnectionId = `account-${accountUUID}`;
        const nangoEnvironmentId = await this.getAdminEnvironmentId();

        // we get the connection on the nango admin account to be able to send the notification
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
            connection_id: slackConnection?.connection_id as string,
            provider_config_key: slackConnection?.provider_config_key as string,
            provider: this.integrationKey,
            environment_id: slackConnection?.environment_id as number,
            operation_name: this.actionName
        };

        const activityLogId = await createActivityLog(log);

        if (!success || !slackNotificationStatus) {
            await createActivityLogMessage({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                content: `Failed looking up the slack notification using the slack notification service. The error was: ${error}`,
                timestamp: Date.now()
            });

            return;
        }

        const envName = await environmentService.getEnvironmentName(nangoConnection.environment_id);

        const count = slackNotificationStatus.connectionCount;
        const connection = count === 1 ? 'connection' : 'connections';
        const flowType = syncType === SyncType.ACTION ? SyncConfigType.ACTION : SyncConfigType.SYNC;
        const payload: NotificationPayload = {
            content: `*${syncName}* (${flowType.toLowerCase()}) is failing for ${count} ${connection}. Read <${getBasePublicUrl()}/activity?env=${envName}&activity_log_id=${originalActivityLogId}|logs>.`,
            status: 'open',
            providerConfigKey: nangoConnection.provider_config_key,
            provider
        };

        if (slackNotificationStatus.slack_timestamp) {
            payload.ts = slackNotificationStatus.slack_timestamp;
        }

        const syncClient = await SyncClient.getInstance();

        const {
            success: actionSuccess,
            error: actionError,
            response: actionResponse
        } = (await syncClient?.triggerAction<SlackActionResponse>(
            slackConnection as NangoConnection,
            this.actionName,
            payload,
            originalActivityLogId,
            environment_id,
            false
        )) as ServiceResponse<SlackActionResponse>;

        await this.updateNotificationWithTimestamp(slackNotificationStatus.id, actionResponse?.ts as string);

        await this.sendDuplicateNotificationToNangoAdmins(
            payload,
            originalActivityLogId,
            environment_id,
            slackNotificationStatus.id,
            slackNotificationStatus.admin_slack_timestamp
        );

        const content = actionSuccess
            ? `The action ${this.actionName} was successfully triggered for the ${flowType} ${syncName} for environment ${slackConnection?.environment_id} for account ${accountUUID}.`
            : `The action ${this.actionName} failed to trigger for the ${flowType} ${syncName} with the error: ${actionError} for environment ${slackConnection?.environment_id} for account ${accountUUID}.`;

        await createActivityLogMessage({
            level: actionSuccess ? 'info' : 'error',
            activity_log_id: activityLogId as number,
            environment_id: slackConnection?.environment_id as number,
            timestamp: Date.now(),
            content,
            params: payload as unknown as Record<string, unknown>
        });

        await updateSuccessActivityLog(activityLogId as number, actionSuccess);
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
        syncType: SyncConfigType,
        originalActivityLogId: number,
        environment_id: number,
        provider: string,
        slack_timestamp: string,
        admin_slack_timestamp: string,
        connectionCount: number
    ) {
        if (syncName === this.actionName) {
            return;
        }

        const envName = await environmentService.getEnvironmentName(nangoConnection.environment_id);

        let payloadContent = '';

        if (connectionCount === 0) {
            payloadContent = `[Resolved] *${syncName}* (${syncType.toLowerCase()}) failed. Read <${getBasePublicUrl()}/activity?env=${envName}&activity_log_id=${originalActivityLogId}|logs>.`;
        } else {
            const count = connectionCount;
            const connection = count === 1 ? 'connection' : 'connections';
            payloadContent = `*${syncName}* (${syncType.toLowerCase()}) is failing for ${count} ${connection}. Read <${getBasePublicUrl()}/activity?env=${envName}&activity_log_id=${originalActivityLogId}|logs>.`;
        }

        const payload: NotificationPayload = {
            content: payloadContent,
            status: connectionCount === 0 ? 'closed' : 'open',
            providerConfigKey: nangoConnection.provider_config_key,
            provider,
            ts: slack_timestamp
        };

        const syncClient = await SyncClient.getInstance();

        const accountUUID = await environmentService.getAccountUUIDFromEnvironment(environment_id);
        const nangoEnvironmentId = await this.getAdminEnvironmentId();
        const slackConnectionId = `account-${accountUUID}`;
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
            connection_id: slackConnection?.connection_id as string,
            provider_config_key: slackConnection?.provider_config_key as string,
            provider: this.integrationKey,
            environment_id: slackConnection?.environment_id as number,
            operation_name: this.actionName
        };

        const activityLogId = await createActivityLog(log);

        const { success: actionSuccess, error: actionError } = (await syncClient?.triggerAction<SlackActionResponse>(
            slackConnection as NangoConnection,
            this.actionName,
            payload,
            originalActivityLogId,
            environment_id,
            false
        )) as ServiceResponse<SlackActionResponse>;

        await this.sendDuplicateNotificationToNangoAdmins(payload, originalActivityLogId, environment_id, undefined, admin_slack_timestamp);

        const content = actionSuccess
            ? `The action ${this.actionName} was successfully triggered for the ${syncType} ${syncName} for environment ${slackConnection?.environment_id} for account ${accountUUID}.`
            : `The action ${this.actionName} failed to trigger for the ${syncType} ${syncName} with the error: ${actionError} for environment ${slackConnection?.environment_id} for account ${accountUUID}.`;

        await createActivityLogMessage({
            level: actionSuccess ? 'info' : 'error',
            activity_log_id: activityLogId as number,
            environment_id: slackConnection?.environment_id as number,
            timestamp: Date.now(),
            content,
            params: payload as unknown as Record<string, unknown>
        });

        await updateSuccessActivityLog(activityLogId as number, actionSuccess);
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
    async createNotification(nangoConnection: NangoConnection, name: string, type: SyncType): Promise<Pick<SlackNotification, 'id'> | null> {
        const result = await schema()
            .from<SlackNotification>(TABLE)
            .insert({
                open: true,
                environment_id: nangoConnection.environment_id,
                name,
                type: type === SyncType.ACTION ? SyncConfigType.ACTION : SyncConfigType.SYNC,
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
    async addFailingConnection(nangoConnection: NangoConnection, name: string, type: SyncType): Promise<ServiceResponse<NotificationResponse>> {
        const isOpen = await this.hasOpenNotification(nangoConnection, name);

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
        type: SyncType,
        originalActivityLogId: number,
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

        connection_list.splice(index, 1);

        await schema()
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
            type === SyncType.ACTION ? SyncConfigType.ACTION : SyncConfigType.SYNC,
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
}

export default new SlackService();
