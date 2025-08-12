import { URL } from 'url';

import * as z from 'zod';

import { externalWebhookService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { DBExternalWebhook, PatchWebhook } from '@nangohq/types';

const urlValidation = z
    .union([z.url(), z.literal('')])
    .optional()
    .refine(
        (url) => {
            if (!url || url.trim() === '') return true;
            const inputUrl = new URL(url);
            return inputUrl.origin !== new URL('https://nango.dev').origin;
        },
        { message: `Webhook URLs cannot point to Nango's domain (nango.dev).` }
    );

const validation = z
    .object({
        primary_url: urlValidation,
        secondary_url: urlValidation,
        on_sync_completion_always: z.boolean().optional(),
        on_auth_creation: z.boolean().optional(),
        on_auth_refresh_error: z.boolean().optional(),
        on_sync_error: z.boolean().optional(),
        on_async_action_completion: z.boolean().optional()
    })
    .strict();

export const patchWebhook = asyncWrapper<PatchWebhook>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { environment } = res.locals;

    const body: PatchWebhook['Body'] = val.data;

    const data: Partial<DBExternalWebhook> = {};
    if (typeof body.primary_url !== 'undefined') {
        data.primary_url = body.primary_url;
    }
    if (typeof body.secondary_url !== 'undefined') {
        data.secondary_url = body.secondary_url;
    }
    if (typeof body.on_sync_completion_always !== 'undefined') {
        data.on_sync_completion_always = body.on_sync_completion_always;
    }
    if (typeof body.on_auth_creation !== 'undefined') {
        data.on_auth_creation = body.on_auth_creation;
    }
    if (typeof body.on_auth_refresh_error !== 'undefined') {
        data.on_auth_refresh_error = body.on_auth_refresh_error;
    }
    if (typeof body.on_sync_error !== 'undefined') {
        data.on_sync_error = body.on_sync_error;
    }
    if (typeof body.on_async_action_completion !== 'undefined') {
        data.on_async_action_completion = body.on_async_action_completion;
    }

    if (Object.keys(data).length <= 0) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Nothing to update' } });
        return;
    }

    await externalWebhookService.update(environment.id, data);

    res.status(200).send({ success: true });
});
