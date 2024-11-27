import type {
    NangoAuthWebhookBodySuccess,
    NangoAuthWebhookBodyError,
    ExternalWebhook,
    Connection,
    WebhookTypes,
    AuthModeType,
    ErrorPayload,
    AuthOperationType,
    NangoAuthWebhookBodyBase,
    DBEnvironment,
    EndUser
} from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import { deliver, shouldSend } from './utils.js';

export async function sendAuth({
    connection,
    environment,
    webhookSettings,
    auth_mode,
    success,
    endUser,
    error,
    operation,
    provider,
    type,
    logCtx
}: {
    connection: Connection | Pick<Connection, 'connection_id' | 'provider_config_key'>;
    environment: DBEnvironment;
    webhookSettings: ExternalWebhook | null;
    auth_mode: AuthModeType;
    success: boolean;
    endUser?: EndUser | undefined;
    error?: ErrorPayload;
    operation: AuthOperationType;
    provider: string;
    type: WebhookTypes;
    logCtx?: LogContext | undefined;
} & ({ success: true } | { success: false; error: ErrorPayload })): Promise<void> {
    if (!webhookSettings) {
        return;
    }

    if (!shouldSend({ success, type: 'auth', webhookSettings, operation })) {
        return;
    }

    let successBody = {} as NangoAuthWebhookBodySuccess;
    let errorBody = {} as NangoAuthWebhookBodyError;

    const body: NangoAuthWebhookBodyBase = {
        from: 'nango',
        type: 'auth',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key,
        authMode: auth_mode,
        provider,
        environment: environment.name,
        operation,
        endUser: endUser ? { endUserId: endUser.endUserId, organizationId: endUser.organization?.organizationId } : undefined
    };

    if (success) {
        successBody = {
            ...body,
            success: true
        };
    } else {
        errorBody = {
            ...body,
            success: false,
            error
        };
    }

    const webhooks = [
        { url: webhookSettings.primary_url, type: 'webhook url' },
        { url: webhookSettings.secondary_url, type: 'secondary webhook url' }
    ].filter((webhook) => webhook.url);

    await deliver({
        webhooks,
        body: success ? successBody : errorBody,
        webhookType: type,
        environment,
        logCtx
    });
}
