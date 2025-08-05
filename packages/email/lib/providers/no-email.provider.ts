import { logger } from '../logger.js';

import type { EmailProvider } from '../provider.js';

export class NoEmailProvider implements EmailProvider<void> {
    // eslint-disable-next-line @typescript-eslint/require-await
    async send(email: string, subject: string, html: string): Promise<void> {
        logger.info('Email client not configured');
        logger.info('The following email would have been sent:');
        logger.info(email, subject);
        logger.info(html);
    }
}
