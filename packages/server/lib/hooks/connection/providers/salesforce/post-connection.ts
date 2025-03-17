import type { InternalNango as Nango } from '../../post-connection.js';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('post-connection:salesforce');

export default function execute(_nango: Nango) {
    logger.info('No post-connection logic needed for Salesforce');
}
