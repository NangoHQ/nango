import { createOnEvent } from 'nango';

export default createOnEvent({
    event: 'pre-connection-deletion',
    description: 'Hello',
    exec: async (nango) => {
        await nango.log('test pre script');
    }
});
