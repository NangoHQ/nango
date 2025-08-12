import { configService } from '@nangohq/shared';

import { sharedCredentialstoApi } from '../../../../formatters/sharedCredentials.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetSharedCredentialsProviders } from '@nangohq/types/lib/sharedCredentials/api.js';

export const getSharedCredentialsProviders = asyncWrapper<GetSharedCredentialsProviders>(async (_, res) => {
    const providers = await configService.getSharedCredentials();

    const formattedProviders = providers.map((provider) => sharedCredentialstoApi(provider));

    res.status(200).send({
        success: true,
        data: formattedProviders
    });
});
