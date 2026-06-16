import * as crypto from 'node:crypto';

import { envs } from '../../../env.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetPlainHmac } from '@nangohq/types';

export const getPlainHmac = asyncWrapper<GetPlainHmac>((_req, res) => {
    const secret = envs.PLAIN_HMAC_SECRET;
    if (!secret) {
        res.status(503).send({ error: { code: 'feature_disabled', message: 'Support chat not configured' } });
        return;
    }

    const { user } = res.locals;
    if (!user?.email) {
        res.status(401).send({ error: { code: 'unauthorized', message: 'User not found' } });
        return;
    }

    const hash = crypto.createHmac('sha256', secret).update(user.email).digest('hex');

    res.status(200).send({ data: { hash } });
});
