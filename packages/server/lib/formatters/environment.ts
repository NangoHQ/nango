import { getGlobalOAuthCallbackUrl } from '@nangohq/shared';
import type { ApiEnvironment, DBEnvironment } from '@nangohq/types';

export function environmentToApi({
    secret_key_iv,
    secret_key_tag,
    secret_key_hashed,
    pending_secret_key_iv,
    pending_secret_key_tag,
    pending_public_key,
    ...env
}: DBEnvironment): ApiEnvironment {
    return {
        ...env,
        callback_url: env.callback_url || getGlobalOAuthCallbackUrl(),
        created_at: env.created_at instanceof Date ? env.created_at.toISOString() : env.created_at,
        updated_at: env.updated_at instanceof Date ? env.updated_at.toISOString() : env.updated_at
    };
}
