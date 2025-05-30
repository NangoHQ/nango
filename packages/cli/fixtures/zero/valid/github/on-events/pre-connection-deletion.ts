import { createOnEvent } from 'nango';

export default createOnEvent({
    event: 'pre-connection-deletion',
    description: 'This script is executed before a connection is deleted',
    exec: async (nango) => {
        await nango.log('Executed');
    }
});
