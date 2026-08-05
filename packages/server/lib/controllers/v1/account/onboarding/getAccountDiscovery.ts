import { accountService, userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { getPendingAccountDiscovery, setAccountDiscoveryRecommendation } from './accountDiscoverySession.js';

import type { GetOnboardingAccountDiscovery } from '@nangohq/types';

export const getOnboardingAccountDiscovery = asyncWrapper<GetOnboardingAccountDiscovery>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { user, account } = res.locals;

    const discovery = await getPendingAccountDiscovery(req, user.id);
    if (discovery?.recommendation) {
        res.status(200).send({ data: { suggestedAccountName: discovery.recommendation.accountName } });
        return;
    }

    if (!(await userService.consumeAccountDiscoveryPendingMarker(user.id))) {
        res.status(404).send({ error: { code: 'not_found', message: 'Account discovery is only available during onboarding.' } });
        return;
    }

    const suggestedAccount = await accountService.findAccountWithSameDomain({ email: user.email, currentAccountId: account.id });
    if (!suggestedAccount) {
        res.status(200).send({ data: { suggestedAccountName: null } });
        return;
    }

    await setAccountDiscoveryRecommendation(req, user.id, { accountId: suggestedAccount.id, accountName: suggestedAccount.name });

    res.status(200).send({
        data: {
            // Return the account name to render the suggestion in the browser.
            // The account ID remains server-side for the join-request flow.
            suggestedAccountName: suggestedAccount.name ?? null
        }
    });
});
