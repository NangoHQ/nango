import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type NodeConsole = Console & {
    _stdout: NodeJS.WriteStream;
    _stderr: NodeJS.WriteStream;
};

describe('logger cloud format', () => {
    let lines: string[] = [];
    let stdoutSpy: ReturnType<typeof vi.spyOn>;
    let stderrSpy: ReturnType<typeof vi.spyOn>;

    const nodeConsole = console as NodeConsole;

    beforeEach(() => {
        vi.stubEnv('NANGO_CLOUD', 'true');
        vi.stubEnv('LOG_LEVEL', 'info');
        vi.resetModules();
        lines = [];

        const capture = (chunk: string | Uint8Array) => {
            const line = String(chunk).trim();
            if (line) {
                lines.push(line);
            }
            return true;
        };

        stdoutSpy = vi.spyOn(nodeConsole._stdout, 'write').mockImplementation(capture as typeof process.stdout.write);
        stderrSpy = vi.spyOn(nodeConsole._stderr, 'write').mockImplementation(capture as typeof process.stderr.write);
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        vi.unstubAllEnvs();
    });

    async function getTestLogger() {
        const { getLogger } = await import('./logger.js');
        return getLogger('test');
    }

    it('serializes err metadata with stack lifted to top level', async () => {
        const logger = await getTestLogger();
        const err = new Error('boom');
        err.stack = 'Error: boom\n    at test.ts:1:1';

        logger.error('context message', { err });

        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]!);
        expect(parsed.message).toBe('context message');
        expect(parsed.service).toBe('test');
        expect(parsed.status).toBe('error');
        expect(parsed.err).toEqual({ name: 'Error', message: 'boom', stack: 'Error: boom\n    at test.ts:1:1' });
        expect(parsed.stack).toBe('Error: boom\n    at test.ts:1:1');
    });

    it('serializes a positional Error as err', async () => {
        const logger = await getTestLogger();
        const err = new Error('positional');

        logger.error('failed', err);

        const parsed = JSON.parse(lines[0]!);
        expect(parsed.message).toContain('failed');
        expect(parsed.err.name).toBe('Error');
        expect(parsed.err.message).toBe('positional');
        expect(parsed.stack).toBeDefined();
    });

    it('merges metadata objects and serializes error key', async () => {
        const logger = await getTestLogger();
        const err = new Error('wrapped');

        logger.warning('webhook failed', { error: err, connectionId: 42 });

        const parsed = JSON.parse(lines[0]!);
        expect(parsed.message).toBe('webhook failed');
        expect(parsed.connectionId).toBe(42);
        expect(parsed.error.message).toBe('wrapped');
        expect(parsed.status).toBe('warning');
    });

    it('keeps structured fields for object metadata without errors', async () => {
        const logger = await getTestLogger();

        logger.info('Deleting environment...', { environmentId: 1, environmentName: 'prod' });

        const parsed = JSON.parse(lines[0]!);
        expect(parsed.message).toBe('Deleting environment...');
        expect(parsed.environmentId).toBe(1);
        expect(parsed.environmentName).toBe('prod');
    });

    it('merges metadata after tokenized message interpolation', async () => {
        const logger = await getTestLogger();
        const err = new Error('tokenized');

        logger.error('request %s failed', 'abc-123', { err, statusCode: 500 });

        const parsed = JSON.parse(lines[0]!);
        expect(parsed.message).toBe('request abc-123 failed');
        expect(parsed.statusCode).toBe(500);
        expect(parsed.err.message).toBe('tokenized');
        expect(parsed.stack).toBeDefined();
    });

    it('serializes Error used as a format token argument', async () => {
        const logger = await getTestLogger();
        const err = new Error('format-arg');

        logger.error('failed: %s', err);

        const parsed = JSON.parse(lines[0]!);
        expect(parsed.message).toContain('failed:');
        expect(parsed.err.message).toBe('format-arg');
        expect(parsed.stack).toBeDefined();
    });

    it('does not let metadata overwrite canonical log fields', async () => {
        const logger = await getTestLogger();

        logger.info('original message', { message: 'overridden', level: 'error', connectionId: 1 });

        const parsed = JSON.parse(lines[0]!);
        expect(parsed.message).toBe('original message');
        expect(parsed.level).toBe('info');
        expect(parsed.status).toBe('info');
        expect(parsed.connectionId).toBe(1);
    });

    it('strips winston meta.message append when extra splat args are present', async () => {
        const logger = await getTestLogger();

        logger.info('original message', { message: 'overridden', connectionId: 1 }, 'extra');

        const parsed = JSON.parse(lines[0]!);
        expect(parsed.message).toBe('original message');
        expect(parsed.connectionId).toBe(1);
    });

    it('preserves structured object messages as metadata', async () => {
        const logger = await getTestLogger();

        logger.info({ level: 'info', message: { event: 'started', connectionId: 42 } });

        const parsed = JSON.parse(lines[0]!);
        expect(parsed.message).toBe('{"event":"started","connectionId":42}');
        expect(parsed.event).toBe('started');
        expect(parsed.connectionId).toBe(42);
    });
});
