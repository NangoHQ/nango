import { getProvider } from '@nangohq/shared';
import { metrics } from '@nangohq/utils';

import * as preConnectionHandlers from './index.js';
import { getHandler, getInternalNango } from './internal-nango.js';

import type { InternalNango } from './internal-nango.js';
import type { LogContextGetter, LogContextOrigin } from '@nangohq/logs';
import type { DBConnectionDecrypted, DBEnvironment, DBTeam } from '@nangohq/types';

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
    let logCtx: LogContextOrigin | undefined = undefined;

    try {
        const internalNango = getInternalNango(connection, providerName);
        const provider = getProvider(providerName);
        const handler = getHandler({
            provider: provider,
            providerScriptPropertyName: 'pre_connection_deletion_script',
            handlers
        });

        if (handler) {
            logCtx = await logContextGetter.create(
                { operation: { type: 'events', action: 'pre_connection_deletion' } },
                {
                    account: team,
                    environment,
                    integration: { id: connection.config_id, name: connection.provider_config_key, provider: providerName },
                    connection: { id: connection.id, name: connection.connection_id }
                }
            );
            await handler(internalNango);
            void logCtx.info(`pre-connection-deletion script succeeded`);
            await logCtx.success();
            metrics.increment(metrics.Types.PRE_CONNECTION_DELETION_SUCCESS);
        }
    } catch (err) {
        metrics.increment(metrics.Types.PRE_CONNECTION_DELETION_FAILURE);
        void logCtx?.error('Pre-connection deletion script failed', { error: err });
        await logCtx?.failed();
    }
}

export default execute;
