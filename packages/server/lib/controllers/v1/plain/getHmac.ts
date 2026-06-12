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
    const hash = crypto.createHmac('sha256', secret).update(user.email).digest('hex');

    res.status(200).send({ data: { hash } });
});
