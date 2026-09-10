import { oauthLoginHandoffSchema } from '@nangohq/oauth-server/contracts';
import { basePublicUrl } from '@nangohq/utils';

import { issueLoginHandoff } from './interaction-state.service.js';
import { oauthServer } from './server.js';

import type { RequestHandler } from 'express';

const DASHBOARD_ORIGIN = new URL(basePublicUrl).origin;

export const postOAuthLoginHandoff: RequestHandler = async (req, res, next) => {
    try {
        if (!oauthServer) {
            res.status(404).send({ error: { code: 'invalid_handoff', message: 'This authorization request is invalid' } });
            return;
        }
        if (req.get('origin') !== DASHBOARD_ORIGIN) {
            res.status(403).send({ error: { code: 'invalid_handoff', message: 'This authorization request is invalid' } });
            return;
        }
        const body = oauthLoginHandoffSchema.safeParse(req.body);
        if (!body.success || !req.user) {
            res.status(400).send({ error: { code: 'invalid_handoff', message: 'This authorization request is invalid' } });
            return;
        }

        const handoff = await issueLoginHandoff({
            state: body.data.state,
            userId: req.user.id,
            accountId: req.user.account_id,
            issuer: oauthServer.issuer
        });
        if ('error' in handoff) {
            const status = handoff.error === 'expired' ? 410 : handoff.error === 'replayed' ? 409 : handoff.error === 'invalid' ? 400 : 403;
            res.status(status).send({
                error: {
                    code:
                        handoff.error === 'user_suspended'
                            ? 'user_suspended'
                            : handoff.error === 'account_unavailable'
                              ? 'account_unavailable'
                              : 'invalid_handoff',
                    message: 'This authorization request is invalid or expired'
                }
            });
            return;
        }
        res.status(200).send({ data: handoff });
    } catch (err) {
        next(err);
    }
};
