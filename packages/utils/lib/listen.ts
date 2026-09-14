import type { Server } from 'node:http';

export function exitOnListenFailure(server: Server, onFailure: (err: NodeJS.ErrnoException) => void): void {
    // Must run before WebSocketServer's own error listener, which throws and ends the chain.
    server.prependListener('error', (err: NodeJS.ErrnoException) => {
        if (server.listening) {
            throw err;
        }
        onFailure(err);
        process.exit(1);
    });
}
