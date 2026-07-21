import * as z from 'zod';

import db from '@nangohq/database';
import { buildTagsFromEndUser, configService, connectionService, EndUserMapper, linkConnection, updateConnectionTags, upsertEndUser } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionTagsSchema, endUserSchema, webhookUrlSchema } from '../../../helpers/validation.js';

import type { RequestLocals } from '../../../utils/express.js';
import type { DBEnvironment, DBTeam, EndUserInput, PatchPublicConnection, Tags } from '@nangohq/types';
import type { Response } from 'express';

export const patchConnectionBodySchema = z.strictObject({
    end_user: endUserSchema.optional(),
    tags: connectionTagsSchema.optional(),
    webhook_url_override: webhookUrlSchema
});

export async function handlePatchConnection({
    res,
    account,
    environment,
    connectionId,
    providerConfigKey,
    body
}: {
    res: Response<PatchPublicConnection['Reply'], Required<RequestLocals>>;
    account: DBTeam;
    environment: DBEnvironment;
    connectionId: string;
    providerConfigKey: string;
    body: {
        end_user?: EndUserInput | undefined;
        tags?: Tags | undefined;
        webhook_url_override?: string | undefined;
    };
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

    // Generate tags from end_user (similar to postSessions.ts and postReconnect.ts)
    const endUserTags = body.end_user ? buildTagsFromEndUser(body.end_user, null) : {};
    const mergedTags = { ...endUserTags, ...body.tags };

    if (body.end_user) {
        const endUserTxRes = await db.knex.transaction(async (trx) => {
            const endUserRes = await upsertEndUser(trx, { account, environment, connection, endUser: EndUserMapper.apiToEndUser(body.end_user!) });
            if (endUserRes.isErr()) {
                return Err('Failed to update end user');
            }

            if (!connection.end_user_id) {
                await linkConnection(trx, { endUserId: endUserRes.value.id, connection });
            }

            return Ok(undefined);
        });
        if (endUserTxRes.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: endUserTxRes.error.message } });
            return;
        }
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

    // An empty string clears the per-connection override.
    if (typeof body.webhook_url_override === 'string') {
        await connectionService.updateWebhookUrlOverride(connection, body.webhook_url_override === '' ? null : body.webhook_url_override);
    }

    res.status(200).send({ success: true });
}
