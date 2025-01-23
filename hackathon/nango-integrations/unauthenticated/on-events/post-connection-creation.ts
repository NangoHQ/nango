import { createOnEvent } from '../../tmp.js';

export default createOnEvent({
    description: 'yes',
    event: 'post-connection-creation',
    integrationId: 'unauthenticated',
    exec: async (nango) => {
        await nango.log('top');
    }
});
