import { z } from 'zod';

import { sharedCredentialsService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { sharedCredentialsToApi } from '../../../formatters/sharedCredentials.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetSharedCredentialsProvider } from '@nangohq/types';

const paramsValidation = z
    .object({
        id: z.coerce.number()
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

    const { id }: GetSharedCredentialsProvider['Params'] = paramsVal.data;

    const providerResult = await sharedCredentialsService.getSharedCredentialsById(id);

    if (providerResult.isErr()) {
        if (providerResult.error.message === 'not_found') {
            res.status(404).json({
                success: false,
                error: {
                    code: 'not_found',
                    message: 'Shared credentials for the provider not found'
                }
            });
            return;
        }

        res.status(500).json({
            success: false,
            error: {
                code: 'server_error',
                message: providerResult.error.message
            }
        });
        return;
    }

    res.status(200).json({
        success: true,
        data: sharedCredentialsToApi(providerResult.value)
    });
});
