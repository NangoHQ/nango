import * as z from 'zod';

import { configService } from '@nangohq/shared';

import { auth } from '../../../../middlewares/auth.js';
import { resNotFound, resServerError, schemaBadRequest, schemaNotFound, schemaServerError } from '../../../../schemas/errors.js';
import { formatIntegration, schemaIntegration } from '../../../../schemas/integrations.js';

import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const plugin: FastifyPluginCallback = (fastify) => {
    fastify.withTypeProvider<ZodTypeProvider>().route({
        method: 'GET',
        url: '/',

        schema: {
            description: 'Get an integration by its unique name',
            tags: ['Integrations'],
            summary: 'Get an integration by its unique name',
            operationId: 'getIntegration',
            security: [{ secretKey: [] }],
            querystring: z.strictObject({}),
            params: z.strictObject({
                uniqueName: z.string()
            }),
            response: {
                200: z.strictObject({
                    success: z.boolean(),
                    data: schemaIntegration
                }),
                400: schemaBadRequest,
                404: schemaNotFound,
                500: schemaServerError
            }
        },

        preHandler: [auth],

        handler: async (req, res) => {
            const uniqueName = req.params.uniqueName;

            const env = req.environment;
            if (!env) {
                await resServerError(res, 'Failed to get environment');
                return;
            }

            const integration = await configService.getProviderConfig(uniqueName, env.id);
            if (!integration) {
                await resNotFound(res, `Integration "${uniqueName}" does not exist`);
                return;
            }

            res.status(200).send({ success: true, data: formatIntegration(integration) });
        }
    });
};

export default plugin;
