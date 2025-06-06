import { URL } from 'url';
import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { DBExternalWebhook, PatchWebhook } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { externalWebhookService, getApiUrl } from '@nangohq/shared';

const validation = z
    .object({
        primary_url: z.string().url().or(z.literal('')).optional(),
        secondary_url: z.string().url().or(z.literal('')).optional(),
        on_sync_completion_always: z.boolean().optional(),
        on_auth_creation: z.boolean().optional(),
        on_auth_refresh_error: z.boolean().optional(),
        on_sync_error: z.boolean().optional(),
        on_async_action_completion: z.boolean().optional()
    })
    .strict();

const serverHostname = new URL(getApiUrl()).hostname;

const isInvalidWebhookUrl = (url?: string): boolean => {
    if (!url || url.trim() === '') {
        return false;
    }

    try {
        return new URL(url).hostname === serverHostname;
    } catch {
        return false;
    }
};

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
    if (isInvalidWebhookUrl(body.primary_url) || isInvalidWebhookUrl(body.secondary_url)) {
        res.status(400).send({
            error: {
                code: 'invalid_body' as const,
                errors: [
                    {
                        path: ['primary_url', 'secondary_url'],
                        message: `Webhook URLs cannot point to the server domain (${serverHostname}).`
                    }
                ]
            }
        });
        return;
    }

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
