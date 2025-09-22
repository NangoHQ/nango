import type { InternalNango } from '../../internal-nango.js';

export default async function execute(nango: InternalNango): Promise<void> {
    const { connection_config } = await nango.getConnection();

    if (connection_config['username'] && connection_config['password']) {
        await nango.unsetConnectionConfigAttributes('username', 'password');
    }
}
