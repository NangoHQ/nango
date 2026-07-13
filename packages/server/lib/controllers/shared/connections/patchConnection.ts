import db from '@nangohq/database';
import { buildTagsFromEndUser, configService, connectionService, EndUserMapper, linkConnection, updateConnectionTags, upsertEndUser } from '@nangohq/shared';

import type { RequestLocals } from '../../../utils/express.js';
import type { DBEnvironment, DBTeam, EndUserInput, PatchConnection, Tags } from '@nangohq/types';
import type { Response } from 'express';

export async function handlePatchConnection({
    res,
    environment,
    account,
    connectionId,
    providerConfigKey,
    body
}: {
    res: Response<PatchConnection['Reply'], Required<RequestLocals>>;
    environment: DBEnvironment;
    account: DBTeam;
    connectionId: string;
    providerConfigKey: string;
    body: PatchConnection['Body'];
}): Promise<void> {
    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(400).send({ error: { code: 'unknown_provider_config', message: 'Provider does not exists' } });
        return;
    }

    const connectionRes = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
    if (connectionRes.error || !connectionRes.response) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    const connection = connectionRes.response;

    const endUserTags = body.end_user ? buildTagsFromEndUser(body.end_user, null) : {};
    const mergedTags: Tags = { ...endUserTags, ...body.tags };

    if (body.end_user) {
        await db.knex.transaction(async (trx) => {
            const endUserRes = await upsertEndUser(trx, {
                account,
                environment,
                connection,
                endUser: EndUserMapper.apiToEndUser(body.end_user as EndUserInput)
            });
            if (endUserRes.isErr()) {
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to update end user' } });
                return;
            }

            if (!connection.end_user_id) {
                await linkConnection(trx, { endUserId: endUserRes.value.id, connection });
            }
        });
    }

    if (body.end_user || body.tags !== undefined) {
        const tagsRes = await updateConnectionTags(db.knex, {
            connection,
            tags: mergedTags
        });
        if (tagsRes.isErr()) {
            res.status(400).send({ error: { code: 'invalid_body', message: tagsRes.error.message } });
            return;
        }
    }

    res.status(200).send({ success: true });
}
