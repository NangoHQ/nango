import { sharedCredentialsService } from '@nangohq/shared';

import { sharedCredentialsToApi } from '../../formatters/sharedCredentials.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetSharedCredentialsProviders } from '@nangohq/types';

export const getSharedCredentialsProviders = asyncWrapper<GetSharedCredentialsProviders>(async (_, res) => {
    const providersResult = await sharedCredentialsService.listSharedCredentials();

    if (providersResult.isErr()) {
        res.status(500).json({
            success: false,
            error: {
                code: 'server_error',
                message: providersResult.error.message
            }
        });
        return;
    }

    res.status(200).json({
        success: true,
        data: providersResult.value.map((provider) => sharedCredentialsToApi(provider))
    });
});
