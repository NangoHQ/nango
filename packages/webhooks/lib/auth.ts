import type { Connection, Environment, AuthModeType, ErrorPayload, AuthOperationType } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import type { NangoAuthWebhookBody } from './types.js';
import { deliver, shouldSend } from './utils.js';
import { WebhookType } from './enums.js';

export const sendAuth = async ({
    connection,
    environment,
    auth_mode,
    error,
    operation,
    provider,
    type,
    activityLogId,
    logCtx
}: {
    connection: Connection | Pick<Connection, 'connection_id' | 'provider_config_key'>;
    environment: Environment;
    auth_mode: AuthModeType;
    error?: ErrorPayload;
    operation: AuthOperationType;
    provider: string;
    type: string;
    activityLogId: number | null;
    logCtx?: LogContext | undefined;
}): Promise<void> => {
    if (!shouldSend(environment, 'auth')) {
        return;
    }

    const success = typeof error === 'undefined';

    const body: NangoAuthWebhookBody = {
        from: 'nango',
        type: WebhookType.AUTH,
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

    // TODO when settings are available send this webhook
    if (!success) {
        return;
    }

    const webhooks = [
        { url: environment.webhook_url!, type: 'webhook url' },
        { url: environment.webhook_url_secondary!, type: 'secondary webhook url' }
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
