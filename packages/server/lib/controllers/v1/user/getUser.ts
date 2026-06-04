import { FLAGS, getFeatureFlagsClient } from '@nangohq/feature-flags';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { buildPermissions } from '../../../authz/resolve.js';
import { userToAPI } from '../../../formatters/user.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetUser } from '@nangohq/types';

export const getUser = asyncWrapper<GetUser>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account, plan, user } = res.locals;

    // TODO(NAN-5344): temporary, only used to test feature flags end-to-end
    const featureFlags = await getFeatureFlagsClient();
    const isTestFlagEnabled = await featureFlags.isEnabled(FLAGS.TestFlag, { accountId: account.id }, false);

    const userFormatted = userToAPI(user);
    if (isTestFlagEnabled) {
        userFormatted.name = `🚩 TEST FLAG ON 🚩 ${userFormatted.name}`;
    }

    res.status(200).send({
        data: { ...userFormatted, role: user.role, permissions: await buildPermissions(user.role, plan) }
    });
});
