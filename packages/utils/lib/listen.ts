import type { Server } from 'node:http';

// A bind failure otherwise reaches the uncaughtException handler, which never exits. The process
// then holds its crons and database pool while serving nothing.
export function exitOnListenFailure(server: Server, onFailure: (err: NodeJS.ErrnoException) => void): void {
    // WebSocketServer re-emits the server's error on itself, and an unhandled one there throws
    // before a later listener runs. Prepend so this stays first however the caller orders it.
    server.prependListener('error', (err: NodeJS.ErrnoException) => {
        if (server.listening) {
            // Not a bind failure; leave it to the uncaughtException handler.
            throw err;
        }
        onFailure(err);
        process.exit(1);
    });
}
