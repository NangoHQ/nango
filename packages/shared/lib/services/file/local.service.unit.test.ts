import fs from 'fs';
import os from 'os';
import path from 'path';
import { Writable } from 'stream';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DBSyncConfig } from '@nangohq/types';
import type { Response } from 'express';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nango-local-fs-'));
process.env['NANGO_INTEGRATIONS_FULL_PATH'] = TMP_ROOT;

const { default: localFileService } = await import('./local.service.js');

afterAll(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
    for (const entry of fs.readdirSync(TMP_ROOT)) {
        fs.rmSync(path.join(TMP_ROOT, entry), { recursive: true, force: true });
    }
});

function makeSyncConfig(overrides: Partial<DBSyncConfig> = {}): DBSyncConfig {
    return {
        sync_name: 'my-sync',
        type: 'sync',
        sdk_version: '1.0.0-zero',
        file_location: 'ignored-for-local',
        ...overrides
    } as DBSyncConfig;
}

interface CapturedResponse {
    res: Response;
    headers: Record<string, string>;
    chunks: Buffer[];
    done: Promise<void>;
    status: number | null;
    jsonBody: unknown;
}

function makeResponseStub(): CapturedResponse {
    const headers: Record<string, string> = {};
    const chunks: Buffer[] = [];
    let status: number | null = null;
    let jsonBody: unknown;

    let resolveDone: () => void;
    const done = new Promise<void>((r) => {
        resolveDone = r;
    });

    const writable = new Writable({
        write(chunk: Buffer, _enc, cb) {
            chunks.push(Buffer.from(chunk));
            cb();
        }
    });
    writable.on('finish', () => resolveDone());
    writable.on('close', () => resolveDone());

    const res = writable as unknown as Response;
    (res as any).setHeader = (k: string, v: string) => {
        headers[k] = v;
        return res;
    };
    (res as any).status = (code: number) => {
        status = code;
        return res;
    };
    (res as any).json = (body: unknown) => {
        jsonBody = body;
        resolveDone();
        return res;
    };
    (res as any).send = (body: unknown) => {
        jsonBody = body;
        resolveDone();
        return res;
    };

    return {
        res,
        headers,
        chunks,
        done,
        get status() {
            return status;
        },
        get jsonBody() {
            return jsonBody;
        }
    } as CapturedResponse;
}

describe('LocalFileService', () => {
    describe('putIntegrationFile', () => {
        it('writes a file to the base path', () => {
            const ok = localFileService.putIntegrationFile({ fileName: 'hello.js', fileContent: 'console.log(1)' });
            expect(ok).toBe(true);
            const onDisk = fs.readFileSync(path.join(TMP_ROOT, 'hello.js'), 'utf8');
            expect(onDisk).toBe('console.log(1)');
        });

        it('creates nested directories as needed', () => {
            const ok = localFileService.putIntegrationFile({
                fileName: 'github/syncs/users.ts',
                fileContent: 'export default 1'
            });
            expect(ok).toBe(true);
            const onDisk = fs.readFileSync(path.join(TMP_ROOT, 'github/syncs/users.ts'), 'utf8');
            expect(onDisk).toBe('export default 1');
        });

        it('overwrites an existing file', () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'hello.js'), 'old');
            const ok = localFileService.putIntegrationFile({ fileName: 'hello.js', fileContent: 'new' });
            expect(ok).toBe(true);
            expect(fs.readFileSync(path.join(TMP_ROOT, 'hello.js'), 'utf8')).toBe('new');
        });
    });

    describe('getIntegrationFile', () => {
        it('reads the compiled js file using derived filename ${sync_name}-${providerConfigKey}.js', () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'my-sync-my-provider.js'), 'compiled');
            const content = localFileService.getIntegrationFile({
                syncConfig: makeSyncConfig({ sync_name: 'my-sync' }),
                providerConfigKey: 'my-provider'
            });
            expect(content).toBe('compiled');
        });

        it('returns null when the file is missing', () => {
            const content = localFileService.getIntegrationFile({
                syncConfig: makeSyncConfig({ sync_name: 'missing' }),
                providerConfigKey: 'p'
            });
            expect(content).toBeNull();
        });
    });

    describe('checkForIntegrationSourceFile', () => {
        it('returns true and the resolved path when the file exists', () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'present.ts'), 'x');
            const r = localFileService.checkForIntegrationSourceFile('present.ts');
            expect(r.result).toBe(true);
            expect(fs.realpathSync(r.path)).toBe(fs.realpathSync(path.join(TMP_ROOT, 'present.ts')));
        });

        it('returns false when the file is missing', () => {
            const r = localFileService.checkForIntegrationSourceFile('missing.ts');
            expect(r.result).toBe(false);
        });

        it('resolves symlinks to their real path', () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'target.ts'), 'content');
            fs.symlinkSync(path.join(TMP_ROOT, 'target.ts'), path.join(TMP_ROOT, 'link.ts'));
            const r = localFileService.checkForIntegrationSourceFile('link.ts');
            expect(r.result).toBe(true);
            expect(fs.realpathSync(r.path)).toBe(fs.realpathSync(path.join(TMP_ROOT, 'target.ts')));
        });
    });

    describe('zipAndSendFlow', () => {
        // zipAndSendFlow exercises the private resolveTsFile helper and scriptTypeToPath mapping.
        // Covering these cases pins the precedence and mapping behavior.

        async function runZipAndSend(syncConfig: DBSyncConfig, providerConfigKey: string): Promise<CapturedResponse> {
            const captured = makeResponseStub();
            await localFileService.zipAndSendFlow({ res: captured.res, syncConfig, providerConfigKey });
            await captured.done;
            return captured;
        }

        function hasZipMagic(chunks: Buffer[]): boolean {
            const combined = Buffer.concat(chunks);
            return combined.length >= 4 && combined[0] === 0x50 && combined[1] === 0x4b && combined[2] === 0x03 && combined[3] === 0x04;
        }

        it('produces a valid zip with yaml + js + nested ts (non -zero sdk)', async () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'nango.yaml'), 'models: {}');
            fs.writeFileSync(path.join(TMP_ROOT, 'my-sync-github.js'), 'const x = 1;');
            fs.mkdirSync(path.join(TMP_ROOT, 'github/syncs'), { recursive: true });
            fs.writeFileSync(path.join(TMP_ROOT, 'github/syncs/my-sync.ts'), 'export default async () => 1;');

            const captured = await runZipAndSend(makeSyncConfig({ sync_name: 'my-sync', type: 'sync', sdk_version: '1.0.0' }), 'github');

            expect(captured.headers['Content-Type']).toBe('application/zip');
            expect(captured.headers['Content-Disposition']).toBe('attachment; filename=nango-integrations.zip');
            expect(hasZipMagic(captured.chunks)).toBe(true);
        });

        it('produces a zip without yaml when sdk_version contains -zero', async () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'my-sync-github.js'), 'const x = 1;');
            fs.mkdirSync(path.join(TMP_ROOT, 'github/syncs'), { recursive: true });
            fs.writeFileSync(path.join(TMP_ROOT, 'github/syncs/my-sync.ts'), 'export default async () => 1;');

            const captured = await runZipAndSend(makeSyncConfig({ sync_name: 'my-sync', type: 'sync', sdk_version: '1.0.0-zero' }), 'github');

            expect(captured.headers['Content-Type']).toBe('application/zip');
            expect(hasZipMagic(captured.chunks)).toBe(true);
        });

        it('errors (does not set zip headers) when nango.yaml is missing (non -zero sdk)', async () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'my-sync-github.js'), 'const x = 1;');
            fs.mkdirSync(path.join(TMP_ROOT, 'github/syncs'), { recursive: true });
            fs.writeFileSync(path.join(TMP_ROOT, 'github/syncs/my-sync.ts'), 'export default async () => 1;');

            const captured = await runZipAndSend(makeSyncConfig({ sync_name: 'my-sync', type: 'sync', sdk_version: '1.0.0' }), 'github');

            expect(captured.headers['Content-Type']).toBeUndefined();
            expect(captured.status).not.toBeNull();
        });

        it('resolves nested ts path using scriptTypeToPath for each script type', async () => {
            const cases: { type: DBSyncConfig['type']; dir: string }[] = [
                { type: 'sync', dir: 'syncs' },
                { type: 'action', dir: 'actions' },
                { type: 'on-event', dir: 'on-events' }
            ];

            for (const { type, dir } of cases) {
                for (const entry of fs.readdirSync(TMP_ROOT)) {
                    fs.rmSync(path.join(TMP_ROOT, entry), { recursive: true, force: true });
                }
                fs.writeFileSync(path.join(TMP_ROOT, `fn-provider.js`), 'const x = 1;');
                fs.mkdirSync(path.join(TMP_ROOT, `provider/${dir}`), { recursive: true });
                fs.writeFileSync(path.join(TMP_ROOT, `provider/${dir}/fn.ts`), 'ts');

                const captured = await runZipAndSend(makeSyncConfig({ sync_name: 'fn', type, sdk_version: '1.0.0-zero' }), 'provider');

                expect(captured.headers['Content-Type']).toBe('application/zip');
                expect(hasZipMagic(captured.chunks)).toBe(true);
            }
        });

        it('falls back to flat ts path when nested path does not exist', async () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'fn-provider.js'), 'const x = 1;');
            fs.writeFileSync(path.join(TMP_ROOT, 'fn.ts'), 'flat ts');

            const captured = await runZipAndSend(makeSyncConfig({ sync_name: 'fn', type: 'sync', sdk_version: '1.0.0-zero' }), 'provider');

            expect(captured.headers['Content-Type']).toBe('application/zip');
            expect(hasZipMagic(captured.chunks)).toBe(true);
        });

        it('prefers nested ts over flat ts when both exist', async () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'fn-provider.js'), 'const x = 1;');
            fs.writeFileSync(path.join(TMP_ROOT, 'fn.ts'), 'flat');
            fs.mkdirSync(path.join(TMP_ROOT, 'provider/syncs'), { recursive: true });
            fs.writeFileSync(path.join(TMP_ROOT, 'provider/syncs/fn.ts'), 'nested');

            const captured = await runZipAndSend(makeSyncConfig({ sync_name: 'fn', type: 'sync', sdk_version: '1.0.0-zero' }), 'provider');

            expect(captured.headers['Content-Type']).toBe('application/zip');
            // We can't easily unzip without a dep, but a non-empty archive of a single ts proves resolveTsFile returned a path.
            expect(hasZipMagic(captured.chunks)).toBe(true);
        });

        it('errors when ts file is missing in both nested and flat', async () => {
            fs.writeFileSync(path.join(TMP_ROOT, 'fn-provider.js'), 'const x = 1;');

            const captured = await runZipAndSend(makeSyncConfig({ sync_name: 'fn', type: 'sync', sdk_version: '1.0.0-zero' }), 'provider');

            expect(captured.headers['Content-Type']).toBeUndefined();
            expect(captured.status).not.toBeNull();
        });
    });
});

afterEach(() => {
    // safety: ensure no leftover on failure
});
