import * as z from 'zod';

import db from '@nangohq/database';
import { configService } from '@nangohq/shared';

import { schemaNotFound, schemaServerError } from '../../schemas/errors.js';
import { formatIntegration, schemaIntegration } from '../../schemas/integrations.js';

import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const plugin: FastifyPluginCallback = (fastify) => {
    fastify.withTypeProvider<ZodTypeProvider>().route({
        method: 'GET',
        url: '/integrations',
        schema: {
            description: 'List all integrations',
            tags: ['integrations'],
            summary: 'List all integrations',
            operationId: 'listIntegrations',
            querystring: z.strictObject({
                limit: z.coerce.number().min(1).max(100).optional().default(10)
            }),
            response: {
                200: z.object({
                    success: z.boolean(),
                    data: z.array(schemaIntegration)
                }),
                404: schemaNotFound,
                500: schemaServerError
            }
        },
        handler: async (_, res) => {
            const configs = await configService.listProviderConfigs(db.knex, environment.id);
            res.status(200).send({ success: true, data: configs.map(formatIntegration) });
        }
    });
};

export default plugin;
