import { sendSync } from './sync.js';

export { sendAuth } from './auth.js';
export { sendAsyncActionWebhook } from './asyncAction.js';

export { forwardWebhook } from './forward.js';
export { resolveWebhookSettings } from './utils.js';
export { NANGO_WEBHOOK_SECRET_HEADER, TELEGRAM_SECRET_TOKEN_HEADER, WEBHOOK_SECRET_HEADERS } from './secret-headers.js';

type SendSyncParams = Parameters<typeof sendSync>[0];

export type { SendSyncParams };
export { sendSync };
