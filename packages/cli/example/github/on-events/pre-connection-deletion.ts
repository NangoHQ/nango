import { createOnEvent } from 'nango';

export default createOnEvent({
    event: 'pre-connection-deletion', // 'post-connection-creation' | 'validate-connection'
    description: 'This script is executed before a connection is deleted',
    exec: async (nango) => {
        await nango.log('Executed');
    }
});
