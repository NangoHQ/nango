import path from 'node:path';

import cors from '@fastify/cors';
import { createJsonSchemaTransform, jsonSchemaTransformObject, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { isProd, isTest, report } from '@nangohq/utils';

import { authPlugin } from './middlewares/auth.js';
import { resNotFound, resServerError } from './schemas/errors.js';
import { apiSchemaRegistry } from './schemas/schema.js';
import { logger } from './utils/logger.js';

import type { FastifyInstance } from 'fastify';

export default async function createApp(f: FastifyInstance): Promise<void> {
    f.addHook('onRequest', (req, _res, done) => {
        logger.info(`#${req.id} <- ${req.method} ${req.url}`);
        done();
    });
    f.addHook('onResponse', (_, res, done) => {
        logger.info(`#${res.request.id} -> ${res.statusCode}`);
        done();
    });

    await f.register(cors, {
        origin: ['*'],
        maxAge: 600,
        credentials: true,
        exposedHeaders: ['set-cookie', 'Authorization, Etag, Content-Type, Content-Length, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset']
    });

    // Enable Zod validation and serialization
    f.setValidatorCompiler(validatorCompiler);
    f.setSerializerCompiler(serializerCompiler);

    // Generate openapi specs
    if (!isProd && !isTest) {
        await f.register(import('@fastify/swagger'), {
            openapi: {
                openapi: '3.0.0',
                info: {
                    title: 'Nango API',
                    description: 'Nango API specs used to authorize & sync data with external APIs.',
                    version: '2.0.0'
                },
                servers: [
                    { url: 'https://public.nango.dev', description: 'Production server' },
                    { url: 'http://localhost:3003', description: 'Local server' }
                ],
                tags: [{ name: 'Integrations', description: 'Integrations' }],
                components: {
                    securitySchemes: {
                        secretKey: { type: 'apiKey', name: 'secretKey', in: 'header' }
                    }
                },
                externalDocs: {
                    url: 'https://docs.nango.dev',
                    description: 'Documentation'
                }
            },
            transform: createJsonSchemaTransform({
                schemaRegistry: apiSchemaRegistry
            }),
            transformObject: jsonSchemaTransformObject
        });
    }

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

    // debug
    // f.addHook('onRoute', (route) => {
    //     console.log('onRoute', route.method, route.path);
    // });

    f.register(authPlugin);

    // This loads all plugins defined in routes
    // define your routes in one of these
    f.register(import('@fastify/autoload'), {
        dir: path.join(import.meta.dirname, 'routes'),
        autoHooks: true,
        cascadeHooks: true,
        routeParams: true,
        ignorePattern: /.test.ts$/,
        logLevel: 'debug'
    });
}
