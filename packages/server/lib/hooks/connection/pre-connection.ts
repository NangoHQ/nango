import { getProvider } from '@nangohq/shared';
import * as preConnectionHandlers from './index.js';
import type { LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';
import type { DBConnectionDecrypted, Provider, DBTeam, DBEnvironment } from '@nangohq/types';
import type { InternalNango } from './internal-nango.js';
import { getInternalNango, executeHookScriptLogic, getHandler } from './internal-nango.js';

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
    let logCtx: LogContextOrigin | undefined;

    try {
        const internalNango = getInternalNango(connection, providerName);
        const providerInstance = getProvider(providerName);

        type PreConnectionProvider = Provider & { pre_connection_deletion_script?: string; provider_name?: string; [key: string]: string | undefined };

        const scriptTypeDescription = 'Pre-connection deletion';
        const handler = getHandler<PreConnectionProvider, PreConnectionHandlersMap>(
            providerInstance as PreConnectionProvider,
            'pre_connection_deletion_script',
            handlers,
            scriptTypeDescription
        );

        if (handler) {
            const getLogContext = () => {
                const logContextBasePayload = { operation: { type: 'events', action: 'pre_connection_deletion' } } as const;
                const logContextEntityPayload = {
                    account: team,
                    environment,
                    integration: { id: connection.config_id, name: connection.provider_config_key, provider: providerName },
                    connection: { id: connection.id, name: connection.connection_id }
                };
                return logContextGetter.create(logContextBasePayload, logContextEntityPayload);
            };
            await executeHookScriptLogic({
                internalNango,
                handler,
                getLogContext,
                metricsSuccessType: metrics.Types.PRE_CONNECTION_DELETION_SUCCESS,
                scriptTypeDescription
            });
        }
    } catch (err) {
        metrics.increment(metrics.Types.PRE_CONNECTION_DELETION_FAILURE);
        void logCtx?.error('Pre-connection deletion script failed', { error: err });
        await logCtx?.failed();
    }
}

export default execute;
