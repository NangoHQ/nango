export { sendAuth } from './auth.js';
import { sendSync } from './sync.js';

export { forwardWebhook } from './forward.js';

type SendSyncParams = Parameters<typeof sendSync>[0];

export type { SendSyncParams };
export { sendSync };
