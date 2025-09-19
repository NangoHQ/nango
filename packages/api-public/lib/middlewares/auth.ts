import db from '@nangohq/database';
import { environmentService, getPlan } from '@nangohq/shared';
import { flagHasPlan } from '@nangohq/utils';

import { resUnauthorized } from '../schemas/errors.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const secretKeyRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

export function authPlugin(fastify: FastifyInstance) {
    fastify.decorateRequest('team', null);
    fastify.decorateRequest('environment', null);
    fastify.decorateRequest('plan', null);
    fastify.decorateRequest('authType', null);
}

const auth = async (req: FastifyRequest, res: FastifyReply) => {
    const { authorization } = req.headers;
    if (!authorization) {
        await resUnauthorized(res as any, 'No authorization header');
        return;
    }

    const secret = authorization.split('Bearer ').pop();
    if (!secret) {
        await resUnauthorized(res as any, 'No secret key in authorization header');
        return;
    }

    if (!secretKeyRegex.test(secret)) {
        await resUnauthorized(res as any, 'Invalid secret key');
        return;
    }

    const result = await environmentService.getAccountAndEnvironmentBySecretKey(secret);
    if (!result) {
        await resUnauthorized(res as any, 'Unknown account');
        return;
    }

    if (flagHasPlan) {
        const planRes = await getPlan(db.knex, { accountId: result.account.id });
        if (planRes.isErr()) {
            await resUnauthorized(res as any, 'Plan not found');
            return;
        }
        req.setDecorator('plan', planRes.value);
    }

    req.setDecorator('team', result.account);
    req.setDecorator('environment', result.environment);
    req.setDecorator('authType', 'secretKey');
};

export function withAuth<TRequest extends FastifyRequest, TReply extends FastifyReply>(handler: (req: TRequest, res: TReply) => unknown) {
    return async (req: TRequest, res: TReply) => {
        await auth(req, res);
        if (res.statusCode) {
            return;
        }

        return handler(req, res);
    };
}
