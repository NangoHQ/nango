import fp from 'fastify-plugin';

import db from '@nangohq/database';
import { environmentService, getPlan } from '@nangohq/shared';
import { flagHasPlan } from '@nangohq/utils';

import { resUnauthorized } from '../schemas/errors.js';

import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';
import type { FastifyReply, FastifyRequest } from 'fastify';

const secretKeyRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

declare module 'fastify' {
    export interface FastifyRequest {
        environment: DBEnvironment | null;
        team: DBTeam | null;
        plan: DBPlan | null;
        authType: 'secretKey' | null;
    }
}

export const authPlugin = fp(
    (fastify) => {
        fastify.decorateRequest('team', null);
        fastify.decorateRequest('environment', null);
        fastify.decorateRequest('plan', null);
        fastify.decorateRequest('authType', null);
    },
    { name: 'authorization' }
);

export interface AuthDecorator {
    environment: DBEnvironment | null;
    plan: DBPlan | null;
    team: DBTeam | null;
    authType: 'secretKey';
}

export async function auth(req: FastifyRequest, res: FastifyReply) {
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
        await resUnauthorized(res as any, 'Unknown secret key');
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
}
