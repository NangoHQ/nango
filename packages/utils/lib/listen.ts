import type { Server } from 'node:http';

// A bind failure otherwise lands in the service's uncaughtException handler, which never exits,
// leaving the crons, consumers and database pool running with nothing served and no port to spot.
export function exitOnListenFailure(server: Server, onFailure: (err: NodeJS.ErrnoException) => void): void {
    server.on('error', (err: NodeJS.ErrnoException) => {
        if (server.listening) {
            // Not a bind failure; leave it to the uncaughtException handler as before.
            throw err;
        }
        onFailure(err);
        process.exit(1);
    });
}
