import { z } from 'zod';

import { configService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { sharedCredentialsSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PatchSharedCredentialsProvider } from '@nangohq/types/lib/sharedCredentials/api.js';

const paramsValidation = z
    .object({
        id: z.string().min(1)
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
    const providerData = valBody.data;

    try {
        await configService.editSharedCredentials(parseInt(id), {
            name: providerData.name,
            client_id: providerData.client_id,
            client_secret: providerData.client_secret,
            scopes: providerData.scopes
        });

        res.status(200).send({ success: true });
    } catch (err) {
        if (err instanceof Error) {
            if (err.message.includes('Shared credentials for the provider not found')) {
                res.status(404).json({
                    error: {
                        code: 'shared_credentials_provider_not_found',
                        message: 'Shared credentials for the provider not found'
                    }
                });
                return;
            }

            if (err.message.includes('Shared credentials for the provider already exists')) {
                res.status(400).json({
                    error: {
                        code: 'shared_credentials_already_exists',
                        message: 'Shared credentials for the provider already exists'
                    }
                });
                return;
            }
        }
        throw err;
    }
});
