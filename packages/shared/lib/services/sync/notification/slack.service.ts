import { schema, dbNamespace } from '../../../db/database.js';
import type { SlackNotification } from '../../../models/SlackNotification';
import type { NangoConnection } from '../../../models/Connection';
import type { ServiceResponse } from '../../../models/Generic';
import type { SyncType } from '../../../models/Sync';
import environmentService from '../../environment.service.js';
import { LogActionEnum, LogLevel } from '../../../models/Activity.js';
import { updateSuccess as updateSuccessActivityLog, createActivityLogMessage, createActivityLog } from '../../activity/activity.service.js';
import { getBaseUrl } from '../../../utils/utils.js';
import connectionService from '../../connection.service.js';
import accountService from '../../account.service.js';
import SyncClient from '../../../clients/sync.client.js';

const TABLE = dbNamespace + 'slack_notifications';

interface NotificationResponse {
    isOpen: boolean;
    connectionCount: number;
}

class SlackService {
    private actionName = 'flow-result-notifier-action';
    private integrationKey = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
    private nangoAdminUUID = process.env['NANGO_ADMIN_UUID'];
    private env = 'prod';

    private async getNangoAdminConnection() {
        const info = await accountService.getAccountAndEnvironmentIdByUUID(this.nangoAdminUUID as string, this.env);
        const [nangoAdminConnection] = await connectionService.getConnectionsByEnvironmentAndConfig(info?.environmentId as number, this.integrationKey);

        return { info, nangoAdminConnection };
    }

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

        const adminConnection = await this.getNangoAdminConnection();

        if (!adminConnection) {
            return;
        }

        const { info, nangoAdminConnection } = adminConnection;

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: LogActionEnum.ACTION,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoAdminConnection?.connection_id as string,
            provider_config_key: nangoAdminConnection?.provider_config_key as string,
            provider: this.integrationKey,
            environment_id: info?.environmentId as number,
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

        // There is an open slack notification so no need to send another notification
        if (slackNotificationStatus.isOpen) {
            return;
        }

        const envName = await environmentService.getEnvironmentName(nangoConnection.environment_id);

        const payload = {
            title: `${syncType} Failure`,
            content: `The ${syncType} "${syncName}" failed. Please check the logs (${getBaseUrl()}/activity?env=${envName}&activity_log_id=${originalActivityLogId}) for more information.`,
            connectionCount: slackNotificationStatus.connectionCount,
            status: 'open',
            name: syncName,
            providerConfigKey: nangoConnection.provider_config_key,
            provider
        };

        const syncClient = await SyncClient.getInstance();

        const { success: actionSuccess, error: actionError } = (await syncClient?.triggerAction(
            nangoAdminConnection as NangoConnection,
            this.actionName,
            payload,
            originalActivityLogId,
            environment_id,
            false
        )) as ServiceResponse;

        const content = actionSuccess
            ? `The action ${this.actionName} was successfully triggered for the ${syncType} ${syncName} for environment ${info?.environmentId} for account ${info?.accountId}.`
            : `The action ${this.actionName} failed to trigger for the ${syncType} ${syncName} with the error: ${actionError} for environment ${info?.environmentId} for account ${info?.accountId}.`;

        await createActivityLogMessage({
            level: actionSuccess ? 'info' : 'error',
            activity_log_id: activityLogId as number,
            environment_id: info?.environmentId as number as number,
            timestamp: Date.now(),
            content,
            params: payload
        });

        await updateSuccessActivityLog(activityLogId as number, actionSuccess);
    }

    async reportResolution(
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

        const envName = await environmentService.getEnvironmentName(nangoConnection.environment_id);

        const payload = {
            title: `${syncType} Success`,
            content: `The ${syncType} "${syncName}" had failing connection(s) and now all connections are successful. See (${getBaseUrl()}/activity?env=${envName}&activity_log_id=${originalActivityLogId}) for the log message.`,
            connectionCount: 0,
            status: 'closed',
            name: syncName,
            providerConfigKey: nangoConnection.provider_config_key,
            provider
        };

        const syncClient = await SyncClient.getInstance();
        const adminConnection = await this.getNangoAdminConnection();

        if (!adminConnection) {
            return;
        }

        const { info, nangoAdminConnection } = adminConnection;

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: LogActionEnum.ACTION,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoAdminConnection?.connection_id as string,
            provider_config_key: nangoAdminConnection?.provider_config_key as string,
            provider: this.integrationKey,
            environment_id: info?.environmentId as number,
            operation_name: this.actionName
        };

        const activityLogId = await createActivityLog(log);

        const { success: actionSuccess, error: actionError } = (await syncClient?.triggerAction(
            nangoAdminConnection as NangoConnection,
            this.actionName,
            payload,
            originalActivityLogId,
            environment_id,
            false
        )) as ServiceResponse;

        const content = actionSuccess
            ? `The action ${this.actionName} was successfully triggered for the ${syncType} ${syncName} for environment ${info?.environmentId} for account ${info?.accountId}.`
            : `The action ${this.actionName} failed to trigger for the ${syncType} ${syncName} with the error: ${actionError} for environment ${info?.environmentId} for account ${info?.accountId}.`;

        await createActivityLogMessage({
            level: actionSuccess ? 'info' : 'error',
            activity_log_id: activityLogId as number,
            environment_id: info?.environmentId as number as number,
            timestamp: Date.now(),
            content,
            params: payload
        });

        await updateSuccessActivityLog(activityLogId as number, actionSuccess);
    }

    async hasOpenNotification(nangoConnection: NangoConnection, name: string): Promise<Pick<SlackNotification, 'id' | 'connection_list'> | null> {
        const hasOpenNotification = await schema().select('id', 'connection_list').from<SlackNotification>(TABLE).where({
            open: true,
            environment_id: nangoConnection.environment_id,
            name
        });

        if (!hasOpenNotification || !hasOpenNotification.length) {
            return null;
        }

        return { id: hasOpenNotification[0].id, connection_list: hasOpenNotification[0].connection_list };
    }

    async createNotification(nangoConnection: NangoConnection, name: string, type: SyncType): Promise<void> {
        await schema()
            .from<SlackNotification>(TABLE)
            .insert({
                open: true,
                environment_id: nangoConnection.environment_id,
                name,
                type,
                connection_list: [nangoConnection.id as number]
            });
    }

    async addFailingConnection(nangoConnection: NangoConnection, name: string, type: SyncType): Promise<ServiceResponse<NotificationResponse>> {
        const isOpen = await this.hasOpenNotification(nangoConnection, name);

        if (!isOpen) {
            await this.createNotification(nangoConnection, name, type);

            return {
                success: true,
                error: null,
                response: {
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
                    isOpen: true,
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
                isOpen: true,
                connectionCount: connection_list.length
            }
        };
    }

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

        const { id, connection_list } = isOpen;

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

        if (connection_list.length === 0) {
            await this.reportResolution(nangoConnection, name, type, originalActivityLogId, environment_id, provider);
        }
    }
}

export default new SlackService();
