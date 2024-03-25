import { WorkOS } from '@workos-inc/node';
import { isCloud } from '../utils/utils.js';
import { NangoError } from '../utils/error.js';

let workos: WorkOS | null = null;
if (process.env['WORKOS_API_KEY'] && process.env['WORKOS_CLIENT_ID']) {
    workos = new WorkOS(process.env['WORKOS_API_KEY']);
} else {
    if (isCloud()) {
        throw new NangoError('workos_not_configured');
    }
}

export default workos;
