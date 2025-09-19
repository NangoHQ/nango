import * as z from 'zod';

import { schemaNotFound } from '../utils/responseSchema.js';

import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const plugin: FastifyPluginCallback = (fastify) => {
    fastify.withTypeProvider<ZodTypeProvider>().route({
        method: 'GET',
        url: '/',
        schema: {
            querystring: z.never(),
            response: {
                200: z.object({
                    success: z.boolean()
                }),
                404: schemaNotFound
            }
        },
        handler: (_, res) => {
            res.status(200).send({ success: true });
        }
    });
};

export default plugin;
