import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { exitOnListenFailure } from './listen.js';

describe('exitOnListenFailure', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should exit when the port is already taken', async () => {
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const onFailure = vi.fn();

        const holder = http.createServer();
        await new Promise<void>((resolve) => holder.listen(0, resolve));
        const port = (holder.address() as { port: number }).port;

        const loser = http.createServer();
        exitOnListenFailure(loser, onFailure);
        loser.listen(port);

        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
        expect(onFailure.mock.calls[0]?.[0]).toMatchObject({ code: 'EADDRINUSE' });

        await new Promise<void>((resolve) => holder.close(() => resolve()));
    });

    it('should not exit for an error raised after the server is listening', async () => {
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const onFailure = vi.fn();

        const server = http.createServer();
        exitOnListenFailure(server, onFailure);
        await new Promise<void>((resolve) => server.listen(0, resolve));

        expect(() => server.emit('error', new Error('boom'))).toThrow('boom');
        expect(onFailure).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();

        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
});
