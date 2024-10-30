import type { Connection, UserProvidedProxyConfiguration } from '@nangohq/shared';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { LogActionEnum, LogTypes, proxyService, telemetry } from '@nangohq/shared';

async function execute(connection: Connection, logContextGetter: LogContextGetter) {
    const { environment, provider_config_key } = connection;

        const provider = getProvider(providerName);
        if (!provider || !provider['post_connection_script']) {
            return;
        }
    try {

    } catch (error) {
        await telemetry.log(LogTypes.POST_CONNECTION_SCRIPT_FAILURE, `Post connection manager failed, ${stringifyError(err)}`, LogActionEnum.AUTH, {
            environmentId: String(environment.id),
            connectionId: connection.connection_id,
            providerConfigKey: connection.provider_config_key,
            provider: providerName,
            level: 'error'
        });

        await logCtx?.error('Post connection script failed', { error: err });
        await logCtx?.failed();
}
}
export default execute;
