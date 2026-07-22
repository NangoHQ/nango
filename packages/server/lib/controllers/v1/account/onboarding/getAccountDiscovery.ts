import { accountService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { clearPendingAccountDiscovery, getPendingAccountDiscovery, setDiscoveredAccountRecommendation } from './accountDiscoverySession.js';

import type { GetOnboardingAccountDiscovery } from '@nangohq/types';

export const getOnboardingAccountDiscovery = asyncWrapper<GetOnboardingAccountDiscovery>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { user, account } = res.locals;
    const discovery = await getPendingAccountDiscovery(req, user.id);
    if (!discovery) {
        res.status(404).send({ error: { code: 'not_found', message: 'Account discovery is only available during onboarding.' } });
        return;
    }

    let recommendation = discovery.recommendation;
    if (!recommendation) {
        const suggestedAccount = await accountService.findAccountWithSameDomain({ email: user.email, currentAccountId: account.id });
        if (suggestedAccount) {
            recommendation = { accountId: suggestedAccount.id, accountName: suggestedAccount.name };
            await setDiscoveredAccountRecommendation(req, recommendation);
        } else {
            await clearPendingAccountDiscovery(req);
        }
    }

    res.status(200).send({
        data: {
            // Return the account name to render the suggestion in the browser.
            // The account ID remains server-side for the join-request flow.
            suggestedAccountName: recommendation?.accountName ?? null
        }
    });
});
