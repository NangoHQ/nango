import * as z from 'zod';

import { configService } from '@nangohq/shared';

import { withAuth } from '../../../middlewares/auth.js';
import { resNotFound, schemaNotFound, schemaServerError } from '../../../schemas/errors.js';
import { formatIntegration, schemaIntegration } from '../../../schemas/integrations.js';

import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const plugin: FastifyPluginCallback = (fastify) => {
    fastify.withTypeProvider<ZodTypeProvider>().route({
        method: 'GET',
        url: '/integrations/:uniqueName',
        schema: {
            querystring: z.never(),
            params: z.strictObject({
                uniqueName: z.string()
            }),
            response: {
                200: z.strictObject({
                    success: z.boolean(),
                    data: schemaIntegration
                }),
                404: schemaNotFound,
                500: schemaServerError
            }
        },

        handler: withAuth(async (req, res) => {
            const uniqueName = req.params.uniqueName;

            const integration = await configService.getProviderConfig(uniqueName, environment.id);
            if (!integration) {
                await resNotFound(res, `Integration "${uniqueName}" does not exist`);
                return;
            }

            res.status(200).send({ success: true, data: formatIntegration(integration) });
        })
    });
};

export default plugin;
