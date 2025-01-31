import type {
    NangoAuthWebhookBodySuccess,
    NangoAuthWebhookBodyError,
    ExternalWebhook,
    Connection,
    AuthModeType,
    ErrorPayload,
    AuthOperationType,
    NangoAuthWebhookBodyBase,
    DBEnvironment,
    EndUser,
    IntegrationConfig,
    DBTeam
} from '@nangohq/types';
import { logContextGetter } from '@nangohq/logs';
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
    providerConfig,
    account
}: {
    connection: Connection | Pick<Connection, 'connection_id' | 'provider_config_key'>;
    environment: DBEnvironment;
    webhookSettings: ExternalWebhook | null;
    auth_mode: AuthModeType;
    success: boolean;
    endUser?: EndUser | undefined;
    error?: ErrorPayload;
    operation: AuthOperationType;
    providerConfig?: IntegrationConfig | undefined;
    account: DBTeam;
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
        provider: providerConfig?.provider || 'unknown',
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

    const logCtx = await logContextGetter.create(
        { operation: { type: 'webhook', action: 'sync' } },
        {
            account,
            environment,
            ...(providerConfig ? { integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider } } : {}),
            ...('id' in connection ? { connection: { id: connection.id, name: connection.connection_id } } : {})
        }
    );

    const res = await deliver({
        webhooks,
        body: success ? successBody : errorBody,
        webhookType: 'auth',
        environment,
        logCtx
    });

    if (res.isErr()) {
        await logCtx.failed();
    } else {
        await logCtx.success();
    }
}
