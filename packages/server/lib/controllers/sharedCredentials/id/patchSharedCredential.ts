import { z } from 'zod';

import { getProvider } from '@nangohq/providers';
import { sharedCredentialsService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { sharedCredentialsSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PatchSharedCredentialsProvider } from '@nangohq/types';

const paramsValidation = z
    .object({
        id: z.coerce.number()
    })
    .strict();

export const patchSharedCredentialsProvider = asyncWrapper<PatchSharedCredentialsProvider>(async (req, res) => {
    const valBody = sharedCredentialsSchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).json({
            error: {
                code: 'invalid_body',
                errors: zodErrorToHTTP(valBody.error)
            }
        });
        return;
    }

    const paramsVal = paramsValidation.safeParse(req.params);
    if (!paramsVal.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramsVal.error) }
        });
        return;
    }

    const { id }: PatchSharedCredentialsProvider['Params'] = paramsVal.data;
    const providerData: PatchSharedCredentialsProvider['Body'] = valBody.data;

    const provider = getProvider(providerData.name);
    if (!provider) {
        res.status(404).json({
            error: {
                code: 'invalid_provider',
                message: 'The Provider name provided is not found'
            }
        });
        return;
    }

    const result = await sharedCredentialsService.editSharedCredentials(id, {
        name: providerData.name,
        client_id: providerData.client_id,
        client_secret: providerData.client_secret,
        scopes: providerData.scopes
    });

    if (result.isErr()) {
        if (result.error.message === 'shared_credentials_provider_not_found') {
            res.status(404).json({
                error: {
                    code: 'shared_credentials_provider_not_found',
                    message: 'Shared credentials for the provider not found'
                }
            });
            return;
        }

        if (result.error.message === 'shared_credentials_already_exists') {
            res.status(400).json({
                error: {
                    code: 'shared_credentials_already_exists',
                    message: 'Shared credentials for the provider already exists'
                }
            });
            return;
        }

        res.status(500).json({
            error: {
                code: 'server_error',
                message: result.error.message
            }
        });
        return;
    }

    res.status(200).send({ success: true });
});
