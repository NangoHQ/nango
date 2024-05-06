import type { Request, Response, NextFunction } from 'express';
import {
    accountService,
    getEnvironmentAndAccountId,
    errorManager,
    connectionCreationStartCapCheck as connectionCreationStartCapCheckHook
} from '@nangohq/shared';

export const authCheck = async (req: Request, res: Response, next: NextFunction) => {
    const { success, error, response } = await getEnvironmentAndAccountId(res, req);

    if (!success || response === null) {
        errorManager.errResFromNangoErr(res, error);
        return;
    }

    const { accountId, environmentId } = response;

    const account = await accountService.getAccountById(accountId);

    if (!account) {
        errorManager.errRes(res, 'unknown_account');
        return;
    }

    const { providerConfigKey } = req.params;

    if (account.is_capped && providerConfigKey) {
        const isCapped = await connectionCreationStartCapCheckHook({ providerConfigKey, environmentId, creationType: 'create' });
        if (isCapped) {
            errorManager.errRes(res, 'resource_capped');
            return;
        }
    }

    next();
};
