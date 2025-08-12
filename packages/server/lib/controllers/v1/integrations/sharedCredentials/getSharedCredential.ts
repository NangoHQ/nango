import { z } from 'zod';

import { configService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { sharedCredentialstoApi } from '../../../../formatters/sharedCredentials.js';
import { providerNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetSharedCredentialsProvider } from '@nangohq/types/lib/sharedCredentials/api.js';

const paramsValidation = z
    .object({
        name: providerNameSchema
    })
    .strict();

export const getSharedCredentialsProvider = asyncWrapper<GetSharedCredentialsProvider>(async (req, res) => {
    const paramsVal = paramsValidation.safeParse(req.params);
    if (!paramsVal.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramsVal.error) }
        });
        return;
    }

    const { name }: GetSharedCredentialsProvider['Params'] = paramsVal.data;

    const provider = await configService.getSharedCredentialsbyName(name);

    if (!provider) {
        res.status(404).json({
            success: false,
            error: {
                code: 'not_found',
                message: 'Provider not found'
            }
        });
        return;
    }

    const formattedProvider = sharedCredentialstoApi(provider);

    res.status(200).json({
        success: true,
        data: formattedProvider
    });
});
