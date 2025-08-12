import { configService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { sharedCredentialsSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PostSharedCredentialsProvider } from '@nangohq/types/lib/sharedCredentials/api.js';

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

    try {
        await configService.createSharedCredentials({
            name: providerData.name,
            client_id: providerData.client_id,
            client_secret: providerData.client_secret,
            scopes: providerData.scopes || ''
        });
        res.status(200).send({ success: true });
    } catch (err) {
        if (err instanceof Error && err.message.includes('Shared credentials for the provider already exists')) {
            res.status(400).json({
                error: {
                    code: 'shared_credentials_already_exists',
                    message: 'Shared credentials for the provider already exists'
                }
            });
            return;
        }

        throw err;
    }
});
