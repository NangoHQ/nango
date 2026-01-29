import { getGlobalOAuthCallbackUrl } from '@nangohq/shared';

import type { ApiEnvironment, DBEnvironment } from '@nangohq/types';

export function environmentToApi(env: DBEnvironment): ApiEnvironment {
    // Note: These properties don't exist on DBEnvironment anymore, because they're being removed.
    // Normally, none of them should be present. However, if any of them were, it would be bad.
    // Until we're sure they don't exist anywhere anymore, we filter them out explicitly.
    /* eslint-disable @typescript-eslint/no-dynamic-delete */
    const props = ['secret_key_iv', 'secret_key_tag', 'secret_key_hashed', 'pending_secret_key_iv', 'pending_secret_key_tag', 'pending_public_key'];
    for (const prop of props) {
        delete (env as any)[prop];
    }
    /* eslint-enable @typescript-eslint/no-dynamic-delete */
    return {
        ...env,
        callback_url: env.callback_url || getGlobalOAuthCallbackUrl(),
        created_at: env.created_at instanceof Date ? env.created_at.toISOString() : env.created_at,
        updated_at: env.updated_at instanceof Date ? env.updated_at.toISOString() : env.updated_at
    };
}
