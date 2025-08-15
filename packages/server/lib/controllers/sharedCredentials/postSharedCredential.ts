import { getProvider } from '@nangohq/providers';
import { sharedCredentialsService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { sharedCredentialsSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { PostSharedCredentialsProvider } from '@nangohq/types';

export const postSharedCredentialsProvider = asyncWrapper<PostSharedCredentialsProvider>(async (req, res) => {
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

    const providerData: PostSharedCredentialsProvider['Body'] = valBody.data;

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

    const result = await sharedCredentialsService.createSharedCredentials({
        name: providerData.name,
        client_id: providerData.client_id,
        client_secret: providerData.client_secret,
        scopes: providerData.scopes || ''
    });

    if (result.isErr()) {
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
    }

    res.status(200).send({ success: true });
});
