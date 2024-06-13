import type { NangoAuthWebhookBody, ExternalWebhook, Connection, Environment, AuthModeType, ErrorPayload, AuthOperationType } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import { deliver, shouldSend } from './utils.js';

export const sendAuth = async ({
    connection,
    environment,
    webhookSettings,
    auth_mode,
    success,
    error,
    operation,
    provider,
    type,
    activityLogId,
    logCtx
}: {
    connection: Connection | Pick<Connection, 'connection_id' | 'provider_config_key'>;
    environment: Environment;
    webhookSettings: ExternalWebhook | null;
    auth_mode: AuthModeType;
    success: boolean;
    error?: ErrorPayload;
    operation: AuthOperationType;
    provider: string;
    type: string;
    activityLogId: number | null;
    logCtx?: LogContext | undefined;
}): Promise<void> => {
    if (!webhookSettings) {
        return;
    }

    if (!shouldSend({ success, type: 'auth', webhookSettings, operation })) {
        return;
    }

    const body: NangoAuthWebhookBody = {
        from: 'nango',
        type: 'auth',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key,
        authMode: auth_mode,
        provider,
        environment: environment.name,
        success,
        operation
    };

    if (error) {
        body.error = error;
    }

    const webhooks = [
        { url: webhookSettings.primary_url, type: 'webhook url' },
        { url: webhookSettings.secondary_url, type: 'secondary webhook url' }
    ].filter((webhook) => webhook.url) as { url: string; type: string }[];

    await deliver({
        webhooks,
        body,
        webhookType: type,
        activityLogId,
        environment,
        logCtx
    });
};
