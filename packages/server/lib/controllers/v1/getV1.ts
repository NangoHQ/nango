import * as z from 'zod';

import { connectionService, getActionOrModelByEndpoint } from '@nangohq/shared';
import { baseUrl, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { postPublicTriggerAction } from '../action/postTriggerAction.js';
import { getPublicRecords } from '../records/getRecords.js';

import type { GetPublicV1, HTTP_METHOD } from '@nangohq/types';

const schemaHeaders = z.object({
    'provider-config-key': providerConfigKeySchema,
    'connection-id': connectionIdSchema
});

export const allPublicV1 = asyncWrapper<GetPublicV1>(async (req, res, next) => {
    const valHeaders = schemaHeaders.safeParse(req.headers);
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }

    // Can have query params and body depending on if it's an action or a model

    const { environment } = res.locals;
    const environmentId = environment.id;
    const { 'provider-config-key': providerConfigKey, 'connection-id': connectionId }: GetPublicV1['Headers'] = valHeaders.data;

    const url = new URL(req.originalUrl, baseUrl);
    const path = url.pathname.replace(/^\/v1\//, '/');

    const { success, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);
    if (!success || !connection) {
        res.status(400).send({ error: { code: 'unknown_connection', message: 'Failed to find connection' } });
        return;
    }

    const { action, model } = await getActionOrModelByEndpoint(connection, req.method as HTTP_METHOD, path);
    if (action) {
        const input = req.body || req.params[1];
        req.body = {};
        req.body['action_name'] = action;
        req.body['input'] = input;
        await postPublicTriggerAction(req, res, next);
    } else if (model) {
        Object.defineProperty(req, 'query', { ...Object.getOwnPropertyDescriptor(req, 'query'), value: req.query, writable: true });
        req.query['model'] = model;
        await getPublicRecords(req, res, next);
    } else {
        res.status(404).send({ message: `Unknown endpoint '${req.method} ${path}'` });
    }
});
