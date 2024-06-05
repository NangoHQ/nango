import { expect, describe, it, afterEach, beforeAll } from 'vitest';
import * as fs from 'fs';
import { copyDirectoryAndContents } from './tests/helpers.js';
import { compileAllFiles } from './services/compile.service.js';

describe('Relative file import unit tests', () => {
    const testDirectory = './nango-integrations';
    const fixturesPath = './packages/cli/fixtures';

    beforeAll(async () => {
        if (!fs.existsSync('./packages/cli/dist/nango-sync.d.ts')) {
            await fs.promises.writeFile('./packages/cli/dist/nango-sync.d.ts', '', 'utf8');
        }
    });

    afterEach(async () => {
        await fs.promises.rm(testDirectory, { recursive: true, force: true });
    });

    it('should be able to compile and run imported files', async () => {
        await fs.promises.rm(testDirectory, { recursive: true, force: true });
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/relative-imports/github`, './github');
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/relative-imports/nango.yaml`, `./nango.yaml`);

        const success = await compileAllFiles({ debug: true });

        // run the file and get the output
        // @ts-ignore
        const output = await import('./dist/main-github.js');
        const result = output.default();
        expect(result).toBe('Hello, World!');

        await fs.promises.rm('./github', { recursive: true, force: true });
        await fs.promises.rm('./dist', { recursive: true, force: true });
        await fs.promises.rm('./nango.yaml', { force: true });
        await fs.promises.rm('./models.ts', { force: true });

        expect(success).toBe(true);
    });
});
