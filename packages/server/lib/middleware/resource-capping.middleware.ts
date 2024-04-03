import type { Request, Response, NextFunction } from 'express';
import { getLogger } from '@nangohq/utils/dist/logger.js';
import { getSyncConfigsWithConnectionsByEnvironmentIdAndProviderConfigKey, accountService, getEnvironmentAndAccountId, errorManager } from '@nangohq/shared';

const logger = getLogger('Resource Capping Middleware');

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
        logger.info('is capped');
        // account cannot have more than 3 connections for integrations with active scripts
        console.log(providerConfigKey);
        const syncConfigs = await getSyncConfigsWithConnectionsByEnvironmentIdAndProviderConfigKey(providerConfigKey, environmentId);
        console.log(syncConfigs);
    }

    next();
};
