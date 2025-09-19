import path from 'node:path';

import { fastifyAutoload } from '@fastify/autoload';
import cors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { report } from '@nangohq/utils';

import { authPlugin } from './middlewares/auth.js';
import { resNotFound, resServerError } from './schemas/errors.js';
import { envs } from './utils/envs.js';
import { logger } from './utils/logger.js';

import type { FastifyInstance, FastifyPluginOptions, FastifyServerOptions } from 'fastify';

export default async function createApp(f: FastifyInstance, opts: FastifyPluginOptions): Promise<void> {
    f.addHook('onRequest', (req, _res, done) => {
        logger.info(`#${req.id} <- ${req.method} ${req.url}`);
        done();
    });
    f.addHook('onResponse', (_, res, done) => {
        logger.info(`#${res.request.id} -> ${res.statusCode}`);
        done();
    });

    await f.register(cors, {
        origin: ['http://localhost:3000', 'http://localhost:5173'],
        maxAge: 600,
        credentials: true,
        exposedHeaders: ['set-cookie']
    });

    // Enable Zod validation and serialization
    f.setValidatorCompiler(validatorCompiler);
    f.setSerializerCompiler(serializerCompiler);

    // Generate openapi specs
    await f.register(fastifySwagger, {
        openapi: {
            info: {
                title: 'Nango API',
                description: 'Nango API specs used to authorize & sync data with external APIs.',
                version: '2.0.0'
            },
            servers: [
                {
                    url: envs.NANGO_PUBLIC_API_URL,
                    description: 'Production server'
                }
            ]
        }
    });

    f.register(authPlugin);

    f.setErrorHandler(function (error, _req, res) {
        return resServerError(res as any, error instanceof Error ? error.message : 'Server Error', report(error));
    });

    f.setNotFoundHandler(function (req, res) {
        return resNotFound(res as any, `${req.method} ${req.url}`);
    });

    f.removeAllContentTypeParsers();
    f.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 10_000 }, function (_req, body, done) {
        try {
            const json = JSON.parse(body as string) as unknown;
            done(null, json);
        } catch (err) {
            done(err as Error);
        }
    });

    // This loads all plugins defined in routes
    // define your routes in one of these
    f.register(fastifyAutoload, {
        dir: path.join(import.meta.dirname, 'routes'),
        autoHooks: true,
        cascadeHooks: true,
        options: { ...opts }
    });
}

export const options: FastifyServerOptions = {
    trustProxy: true,
    logger: false
};
