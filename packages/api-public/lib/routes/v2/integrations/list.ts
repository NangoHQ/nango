import * as z from 'zod';

import db from '@nangohq/database';
import { configService } from '@nangohq/shared';

import { auth } from '../../../middlewares/auth.js';
import { resServerError, schemaBadRequest, schemaNotFound, schemaServerError } from '../../../schemas/errors.js';
import { formatIntegration, schemaIntegration } from '../../../schemas/integrations.js';

import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const plugin: FastifyPluginCallback = (fastify) => {
    fastify.withTypeProvider<ZodTypeProvider>().route({
        method: 'GET',
        url: '/',
        schema: {
            description: 'List all integrations',
            tags: ['Integrations'],
            summary: 'List all integrations',
            operationId: 'listIntegrations',
            security: [{ secretKey: [] }],
            querystring: z.strictObject({
                limit: z.coerce.number().min(1).max(100).optional().default(10)
            }),
            response: {
                200: z.object({
                    success: z.boolean(),
                    data: z.array(schemaIntegration)
                }),
                400: schemaBadRequest,
                404: schemaNotFound,
                500: schemaServerError
            }
        },
        preHandler: [auth],
        handler: async (req, res) => {
            const env = req.environment;
            if (!env) {
                await resServerError(res, 'Failed to get environment');
                return;
            }

            const configs = await configService.listProviderConfigs(db.knex, env.id);
            res.status(200).send({
                success: true,
                data: configs.map(formatIntegration)
            });
        }
    });
};

export default plugin;
