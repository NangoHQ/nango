import db from '@nangohq/database';
import { configService, connectionService } from '@nangohq/shared';

import type { RequestLocals } from '../../../utils/express.js';
import type { DBEnvironment, Metadata, PostConnectionMetadata } from '@nangohq/types';
import type { Response } from 'express';

export async function handleReplaceConnectionMetadata({
    res,
    environment,
    connectionId,
    providerConfigKey,
    metadata
}: {
    res: Response<PostConnectionMetadata['Reply'], Required<RequestLocals>>;
    environment: DBEnvironment;
    connectionId: string;
    providerConfigKey: string;
    metadata: Metadata;
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

    const connection = connectionRes.response;

    await connectionService.replaceMetadata([connection.id], metadata, db.knex);

    res.status(200).send({ success: true });
}
