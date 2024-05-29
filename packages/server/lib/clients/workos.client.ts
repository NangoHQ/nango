import { WorkOS } from '@workos-inc/node';
import { NangoError } from '@nangohq/shared';

let workOs: WorkOS | null = null;

export function getWorkOSClient(): WorkOS {
    if (!workOs) {
        const apiKey = process.env['WORKOS_API_KEY'];
        const clientId = process.env['WORKOS_CLIENT_ID'];

        if (apiKey && clientId) {
            workOs = new WorkOS(apiKey);
        } else {
            throw new NangoError('workos_not_configured');
        }
    }

    return workOs;
}
