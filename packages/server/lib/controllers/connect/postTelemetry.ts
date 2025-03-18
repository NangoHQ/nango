import type { PostPublicConnectTelemetry } from '@nangohq/types';
import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { logContextGetter } from '@nangohq/logs';
import { providerConfigKeySchema } from '../../helpers/validation.js';
import { UAParser } from 'ua-parser-js';

export const bodySchema = z
    .object({
        token: z.string(),
        event: z.enum([
            'open',
            'view:list',
            'view:integration',
            'view:unknown_error',
            'view:credentials_error',
            'view:success',
            'click:integration',
            'click:doc',
            'click:doc_section',
            'click:connect',
            'click:close',
            'click:finish',
            'click:outside',
            'popup:blocked_by_browser',
            'popup:closed_early'
        ]),
        timestamp: z.coerce.date(),
        dimensions: z.object({ integration: providerConfigKeySchema.optional() }).optional()
    })
    .strict();

const mapEvents: Record<PostPublicConnectTelemetry['Body']['event'], string> = {
    open: 'User opened Connect UI',
    'view:list': 'Viewed list of integration screen',
    'view:integration': 'Viewed integration screen',
    'view:unknown_error': 'Viewed unknown error screen',
    'view:credentials_error': 'Viewed credentials error screen',
    'view:success': 'Viewed success screen',
    'click:integration': 'Clicked an integration',
    'click:doc': 'Clicked global documentation link',
    'click:doc_section': 'Clicked section documentation link',
    'click:connect': 'Clicked button connect',
    'click:close': 'Clicked close',
    'click:finish': 'Clicked finish button to quit',
    'click:outside': 'Clicked outside the UI to quit',
    'popup:blocked_by_browser': 'Popup was blocked by the browser',
    'popup:closed_early': 'Popup was closed by the user before connecting'
};

export const postConnectTelemetry = asyncWrapper<PostPublicConnectTelemetry>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = bodySchema.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { connectSession, account } = res.locals;
    const body: PostPublicConnectTelemetry['Body'] = val.data;

    const logCtx = logContextGetter.getStateLess({ id: connectSession.operationId!, accountId: account.id });
    switch (body.event) {
        case 'open': {
            const ua = UAParser(req.headers['user-agent']);
            await logCtx.log({
                type: 'log',
                level: 'info',
                createdAt: body.timestamp.toISOString(),
                message: `[UI] ${mapEvents[body.event]}`,
                meta: { browser: ua.browser, os: ua.os, device: ua.device }
            });
            break;
        }

        case 'view:unknown_error':
        case 'view:credentials_error':
        case 'popup:blocked_by_browser':
        case 'popup:closed_early':
            await logCtx.log({
                type: 'log',
                level: 'error',
                createdAt: body.timestamp.toISOString(),
                message: `[UI] ${mapEvents[body.event]} (${body.event})`,
                meta: { ...body.dimensions, event: body.event }
            });
            break;

        default:
            await logCtx.log({
                type: 'log',
                level: 'info',
                createdAt: body.timestamp.toISOString(),
                message: `[UI] ${mapEvents[body.event]} (${body.event})`,
                meta: { ...body.dimensions, event: body.event }
            });
            break;
    }

    res.status(204).send();
});
