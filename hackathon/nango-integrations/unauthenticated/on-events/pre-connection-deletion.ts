import { createOnEvent } from '../../tmp.js';

// Events
export default createOnEvent({
    description: 'yes',
    event: 'pre-connection-deletion',
    integrationId: 'unauthenticated',
    exec: async (nango) => {
        await nango.log('top');
    }
});
