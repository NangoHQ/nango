import { getProvider } from '@nangohq/shared';
import * as preConnectionHandlers from './index.js';
import type { LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';
import type { DBConnectionDecrypted, Provider, DBTeam, DBEnvironment } from '@nangohq/types';
import type { InternalNango } from './internal-nango.js';
import { createInternalNangoInstance, executeHookScriptLogic } from './internal-nango.js';

type PreConnectionHandler = (internalNango: InternalNango) => Promise<void>;
type PreConnectionHandlersMap = Record<string, PreConnectionHandler>;
const handlers: PreConnectionHandlersMap = preConnectionHandlers as unknown as PreConnectionHandlersMap;

async function execute({
    connection,
    environment,
    team,
    providerName,
    logContextGetter
}: {
    connection: DBConnectionDecrypted;
    environment: DBEnvironment;
    team: DBTeam;
    providerName: string;
    logContextGetter: LogContextGetter;
}) {
    let overallLogCtx: LogContextOrigin | undefined;

    try {
        const internalNango = createInternalNangoInstance(connection, providerName);
        const providerInstance = getProvider(providerName);

        type PreConnectionProvider = Provider & { pre_connection_deletion_script?: string; provider_name?: string; [key: string]: string | undefined };

        await executeHookScriptLogic<PreConnectionProvider, PreConnectionHandlersMap>({
            internalNango,
            provider: providerInstance as PreConnectionProvider,
            providerScriptPropertyName: 'pre_connection_deletion_script',
            handlersMap: handlers,
            logContextGetter,
            logContextBasePayload: { operation: { type: 'events', action: 'pre_connection_deletion' } },
            logContextEntityPayload: {
                account: team,
                environment,
                integration: { id: connection.config_id, name: connection.provider_config_key, provider: providerName },
                connection: { id: connection.id, name: connection.connection_id }
            },
            metricsSuccessType: metrics.Types.PRE_CONNECTION_DELETION_SUCCESS,
            scriptTypeDescription: 'Pre-connection deletion'
        });
    } catch (err) {
        metrics.increment(metrics.Types.PRE_CONNECTION_DELETION_FAILURE);
        try {
            overallLogCtx = await logContextGetter.create(
                { operation: { type: 'events', action: 'pre_connection_deletion' } },
                {
                    account: team,
                    environment,
                    integration: { id: connection.config_id, name: connection.provider_config_key, provider: providerName },
                    connection: { id: connection.id, name: connection.connection_id }
                }
            );
            void overallLogCtx.error('Pre-connection deletion hook execution failed', { error: err });
            await overallLogCtx.failed();
        } catch (logErr) {
            console.error('Outer catch: Pre-connection deletion hook failed AND also failed to create log context', { originalError: err, logError: logErr });
        }
    }
}

export default execute;
