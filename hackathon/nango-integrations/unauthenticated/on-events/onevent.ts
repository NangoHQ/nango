import { createOnEvent } from '../../tmp.js';

// Events
export default createOnEvent({
    name: 'My Pre connection',
    description: 'yes',
    event: 'pre-connection-deletion',
    integrationId: 'unauthenticated',
    exec: async (nango) => {
        await nango.log('top');
    }
});

// Events
createOnEvent({
    name: 'My post connection',
    description: 'yes',
    event: 'post-connection-creation',
    integrationId: 'unauthenticated',
    exec: async (nango) => {
        await nango.log('top');
    }
});
