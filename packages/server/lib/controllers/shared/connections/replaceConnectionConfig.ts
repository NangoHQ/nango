import { configService, connectionService } from '@nangohq/shared';

import type { RequestLocals } from '../../../utils/express.js';
import type { ConnectionConfig, DBEnvironment, PatchConnectionConfig } from '@nangohq/types';
import type { Response } from 'express';

export async function handleReplaceConnectionConfig({
    res,
    environment,
    connectionId,
    providerConfigKey,
    connectionConfig
}: {
    res: Response<PatchConnectionConfig['Reply'], Required<RequestLocals>>;
    environment: DBEnvironment;
    connectionId: string;
    providerConfigKey: string;
    connectionConfig: ConnectionConfig;
}): Promise<void> {
    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(400).send({ error: { code: 'unknown_provider_config', message: 'Provider does not exist' } });
        return;
    }

    const connectionRes = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
    if (connectionRes.error || !connectionRes.response) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    await connectionService.replaceConnectionConfig(connectionRes.response, connectionConfig);

    res.status(200).send({ success: true });
}
