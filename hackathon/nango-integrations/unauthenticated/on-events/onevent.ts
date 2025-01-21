import { createOnEvent } from '../../models.js';

// Events
export default createOnEvent({
    name: 'My Pre connection',
    description: 'yes',
    type: 'pre-connection-deletion',
    integrationId: 'unauthenticated',
    exec: async (nango) => {
        await nango.log('top');
    }
});

// Events
createOnEvent({
    name: 'My post connection',
    description: 'yes',
    type: 'post-connection-creation',
    integrationId: 'unauthenticated',
    exec: async (nango) => {
        await nango.log('top');
    }
});
