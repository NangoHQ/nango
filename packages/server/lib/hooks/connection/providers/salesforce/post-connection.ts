import { getLogger } from '@nangohq/utils';

import type { InternalNango as Nango } from '../../internal-nango.js';

const logger = getLogger('post-connection:salesforce');

export default function execute(_nango: Nango) {
    logger.info('No post-connection logic needed for Salesforce');
}
