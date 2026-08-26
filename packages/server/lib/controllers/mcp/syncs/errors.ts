import { InternalMcpError, PublicMcpError } from '../utils.js';

import type { NangoError } from '@nangohq/shared';

export function syncCommandErrorToMcp(error: NangoError | null): Error {
    switch (error?.type) {
        case 'no_syncs_found':
            return new PublicMcpError(error.message);
        case 'unknown_connection':
            return new PublicMcpError('Connection does not exist');
        case 'unknown_provider_config':
            return new PublicMcpError('Integration does not exist');
        default:
            return error ?? new InternalMcpError();
    }
}
