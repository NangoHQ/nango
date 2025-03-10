import type {
    NangoAuthWebhookBodySuccess,
    NangoAuthWebhookBodyError,
    DBExternalWebhook,
    AuthModeType,
    ErrorPayload,
    AuthOperationType,
    NangoAuthWebhookBodyBase,
    DBEnvironment,
    EndUser,
    IntegrationConfig,
    DBTeam,
    DBConnection
} from '@nangohq/types';
import { logContextGetter, OtlpSpan } from '@nangohq/logs';
import { deliver, shouldSend } from './utils.js';
import { metrics } from '@nangohq/utils';

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
    connection: DBConnection | Pick<DBConnection, 'connection_id' | 'provider_config_key'>; // Either a true connection or a fake one
    environment: DBEnvironment;
    webhookSettings: DBExternalWebhook | null;
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

    const webhooks: { url: string; type: string }[] = [];
    if (webhookSettings.primary_url) {
        webhooks.push({ url: webhookSettings.primary_url, type: 'webhook url' });
    }
    if (webhookSettings.secondary_url) {
        webhooks.push({ url: webhookSettings.secondary_url, type: 'secondary webhook url' });
    }

    const action = operation === 'creation' ? 'connection_create' : 'connection_refresh';
    const logCtx = await logContextGetter.create(
        { operation: { type: 'webhook', action } },
        {
            account,
            environment,
            ...(providerConfig ? { integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider } } : {}),
            ...('id' in connection ? { connection: { id: connection.id, name: connection.connection_id } } : {})
        }
    );
    logCtx.attachSpan(new OtlpSpan(logCtx.operation));

    const res = await deliver({
        webhooks,
        body: success ? successBody : errorBody,
        webhookType: 'auth',
        environment,
        logCtx
    });

    if (res.isErr()) {
        metrics.increment(metrics.Types.WEBHOOK_OUTGOING_FAILED, 1, { type: 'auth', operation });
        await logCtx.failed();
    } else {
        metrics.increment(metrics.Types.WEBHOOK_OUTGOING_SUCCESS, 1, { type: 'auth', operation });
        await logCtx.success();
    }
}
