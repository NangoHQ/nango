import fs from 'node:fs';
import os from 'node:os';
import path, { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { compileAllFiles, compileSingleFile, getFileToCompile } from './services/compile.service.js';
import { parse } from './services/config.service.js';
import { init } from './services/init.service.js';
import { directoryMigration, endpointMigration } from './services/migration.service.js';
import parserService from './services/parser.service.js';
import { copyDirectoryAndContents, fixturesPath, getTestDirectory } from './tests/helpers.js';

describe('generate function tests', () => {
    // Not the best but until we have a logger it will work
    const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    afterEach(() => {
        consoleMock.mockReset();
    });

    it('should not complain of try catch not being awaited', () => {
        const awaiting = parserService.callsAreUsedCorrectly(join(fixturesPath, 'sync.ts'), 'sync', ['GithubIssue']);
        expect(awaiting).toBe(true);
    });

    it('should complain when a return statement is used', () => {
        const noReturnUsed = parserService.callsAreUsedCorrectly(join(fixturesPath, 'return-sync.ts'), 'sync', ['GithubIssue']);
        expect(noReturnUsed).toBe(false);
    });

    it('should not complain when a return statement is used but does not return anything', () => {
        const noReturnUsed = parserService.callsAreUsedCorrectly(join(fixturesPath, 'void-return-sync.ts'), 'sync', ['GithubIssue']);
        expect(noReturnUsed).toBe(true);
    });

    it('should not complain when a return statement is used in a nested function', () => {
        const noReturnUsed = parserService.callsAreUsedCorrectly(join(fixturesPath, 'nested-return-sync.ts'), 'sync', ['GreenhouseEeoc']);
        expect(noReturnUsed).toBe(true);
    });

    it('should complain of a non try catch not being awaited', () => {
        const awaiting = parserService.callsAreUsedCorrectly(join(fixturesPath, 'failing-sync.ts'), 'sync', ['GithubIssue']);
        expect(awaiting).toBe(false);
    });

    it('should not complain about a correct model', () => {
        const usedCorrectly = parserService.callsAreUsedCorrectly(join(fixturesPath, 'bad-model.ts'), 'sync', ['SomeBadModel']);
        expect(usedCorrectly).toBe(true);
    });

    it('should not complain about awaiting when it is returned for an action', () => {
        const awaiting = parserService.callsAreUsedCorrectly(join(fixturesPath, 'no-async-return.ts'), 'action', ['SomeModel']);
        expect(awaiting).toBe(true);
    });

    it('should complain about an incorrect model', () => {
        const awaiting = parserService.callsAreUsedCorrectly(join(fixturesPath, 'bad-model.ts'), 'sync', ['GithubIssue']);
        expect(awaiting).toBe(false);
    });

    it('should complain if retryOn is used without retries', () => {
        const usedCorrectly = parserService.callsAreUsedCorrectly(join(fixturesPath, 'retry-on-bad.ts'), 'sync', ['GithubIssue']);
        expect(usedCorrectly).toBe(false);
    });

    it('should not complain if retryOn is used with retries', () => {
        const usedCorrectly = parserService.callsAreUsedCorrectly(join(fixturesPath, 'retry-on-good.ts'), 'sync', ['GithubIssue']);
        expect(usedCorrectly).toBe(false);
    });

    it('should be able to compile files in nested directories', async () => {
        const dir = await getTestDirectory('nested');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(join(fixturesPath, 'nango-yaml/v2/nested-integrations/hubspot'), join(dir, 'hubspot'));
        await copyDirectoryAndContents(join(fixturesPath, 'nango-yaml/v2/nested-integrations/github'), join(dir, 'github'));
        await fs.promises.copyFile(join(fixturesPath, 'nango-yaml/v2/nested-integrations/nango.yaml'), join(dir, 'nango.yaml'));

        {
            // Compile everything
            const result = await compileAllFiles({ fullPath: dir, debug: true });

            //. these should report any failed paths somehow, not just true!=false
            expect(fs.existsSync(join(dir, 'models.ts'))).toBe(true);
            expect(fs.existsSync(join(dir, 'hubspot/syncs/contacts.ts'))).toBe(true);
            expect(fs.existsSync(join(dir, 'dist/contacts-hubspot.js'))).toBe(true);
            expect(fs.existsSync(join(dir, 'dist/issues-github.js'))).toBe(true);

            expect(result).toEqual({
                success: true,
                failedFiles: []
            });
        }

        {
            // Compile one file
            const result = await compileAllFiles({ fullPath: dir, debug: true, scriptName: 'contacts', providerConfigKey: 'hubspot', type: 'syncs' });
            expect(result).toEqual({
                success: true,
                failedFiles: []
            });
        }
    });

    it('should be backwards compatible with the single directory for integration files', async () => {
        const dir = await getTestDirectory('old-directory');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(join(fixturesPath, 'nango-yaml/v2/non-nested-integrations'), dir);

        const result = await compileAllFiles({ fullPath: dir, debug: false });

        expect(fs.existsSync(join(dir, 'models.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'contacts.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'dist/contacts-hubspot.js'))).toBe(true);
        expect(result).toEqual({
            success: true,
            failedFiles: []
        });
    });

    it('should be able to migrate-to-directories', async () => {
        const dir = await getTestDirectory('old-directory-migrate');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(join(fixturesPath, 'nango-yaml/v2/non-nested-integrations'), dir);

        await directoryMigration(dir);
        expect(fs.existsSync(join(dir, 'hubspot/syncs/contacts.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'hubspot/actions/create-contact.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'contacts.ts'))).toBe(false);
        expect(fs.existsSync(join(dir, 'create-contacts.ts'))).toBe(false);

        const result = await compileAllFiles({ fullPath: dir, debug: false });
        expect(fs.existsSync(join(dir, 'models.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'dist/contacts-hubspot.js'))).toBe(true);

        expect(result).toEqual({
            success: true,
            failedFiles: []
        });
    });

    it('should be able to compile and run imported files', async () => {
        const dir = await getTestDirectory('relative-imports');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(join(fixturesPath, 'nango-yaml/v2/relative-imports/github'), join(dir, 'github'));
        await fs.promises.copyFile(join(fixturesPath, 'nango-yaml/v2/relative-imports/nango.yaml'), join(dir, 'nango.yaml'));

        const compileResult = await compileAllFiles({ fullPath: dir, debug: false });

        const module = await import(path.normalize(join(dir, 'dist/issues-github.js')));

        const result = module.default.default();
        expect(result).toBe('Hello, world!');

        expect(compileResult).toEqual({
            success: true,
            failedFiles: []
        });
    });

    it('should compile helper functions and throw an error if there is a complication error with an imported file', async () => {
        const name = 'relative-imports-with-error';
        const dir = await getTestDirectory('relative-imports-with-error');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(join(fixturesPath, `nango-yaml/v2/${name}/github`), join(dir, 'github'));
        await fs.promises.copyFile(join(fixturesPath, `nango-yaml/v2/${name}/nango.yaml`), join(dir, 'nango.yaml'));

        const parsing = parse(path.resolve(join(fixturesPath, `nango-yaml/v2/${name}`)));
        if (parsing.isErr()) {
            throw parsing.error;
        }

        const result = await compileSingleFile({
            fullPath: dir,
            file: getFileToCompile({ fullPath: dir, filePath: join(dir, './github/actions/gh-issues.ts') }),
            parsed: parsing.value.parsed!,
            debug: false
        });
        expect(result).toBe(false);
    });

    it('should complain if a nango call is used incorrectly in a nested file', async () => {
        const name = 'relative-imports-with-nango-misuse';
        const dir = await getTestDirectory('relative-imports-with-nango-misuse');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(join(fixturesPath, `nango-yaml/v2/${name}/github`), join(dir, 'github'));
        await fs.promises.copyFile(join(fixturesPath, `nango-yaml/v2/${name}/nango.yaml`), join(dir, 'nango.yaml'));

        const parsing = parse(path.resolve(join(fixturesPath, `nango-yaml/v2/${name}`)));
        if (parsing.isErr()) {
            throw parsing.error;
        }

        const result = await compileSingleFile({
            fullPath: dir,
            file: getFileToCompile({ fullPath: dir, filePath: join(dir, './github/actions/gh-issues.ts') }),
            parsed: parsing.value.parsed!,
            debug: false
        });
        expect(result).toBe(false);
    });

    it('should not allow imports higher than the current directory', async () => {
        const name = 'relative-imports-with-higher-import';
        const dir = await getTestDirectory('relative-imports-with-higher-import');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(join(fixturesPath, `nango-yaml/v2/${name}/github`), join(dir, 'github'));
        await fs.promises.copyFile(join(fixturesPath, `nango-yaml/v2/${name}/nango.yaml`), join(dir, 'nango.yaml'));
        await fs.promises.copyFile(join(fixturesPath, `nango-yaml/v2/${name}/github/actions/welcomer.ts`), join(dir, 'welcomer.ts'));

        const parsing = parse(path.resolve(join(fixturesPath, `nango-yaml/v2/${name}`)));
        if (parsing.isErr()) {
            throw parsing.error;
        }

        const result = await compileSingleFile({
            fullPath: dir,
            file: getFileToCompile({ fullPath: dir, filePath: join(dir, './github/actions/gh-issues.ts') }),
            parsed: parsing.value.parsed!,
            debug: false
        });
        expect(result).toBe(false);
    });

    // Problem with double lines
    it.skipIf(os.platform() === 'win32')('should be able to migrate-endpoints', async () => {
        const dir = await getTestDirectory('old-endpoint');
        init({ absolutePath: dir });

        const dest = join(dir, 'nango.yaml');
        await fs.promises.copyFile(join(fixturesPath, 'nango-yaml/v2/nango.yaml'), dest);

        endpointMigration(dir);

        const content = await fs.promises.readFile(dest, 'utf8');

        expect(content).toMatchSnapshot();
    });

    // Windows symlink are annoying to create
    it.skipIf(os.platform() === 'win32')('should be able to compile files in symlink', async () => {
        const dir = await getTestDirectory('symlink');
        init({ absolutePath: dir });

        await fs.promises.rm(join(dir, 'nango.yaml'));
        await fs.promises.symlink(join(fixturesPath, 'nango-yaml/v2/nested-integrations/nango.yaml'), join(dir, 'nango.yaml'));
        await fs.promises.symlink(join(fixturesPath, 'nango-yaml/v2/nested-integrations/github'), join(dir, 'github'));
        await fs.promises.symlink(join(fixturesPath, 'nango-yaml/v2/nested-integrations/hubspot'), join(dir, 'hubspot'));

        {
            // Compile everything
            const result = await compileAllFiles({ fullPath: dir, debug: true });
            expect(fs.existsSync(join(dir, 'models.ts'))).toBe(true);
            expect(fs.existsSync(join(dir, 'hubspot/syncs/contacts.ts'))).toBe(true);
            expect(fs.existsSync(join(dir, 'dist/contacts-hubspot.js'))).toBe(true);
            expect(fs.existsSync(join(dir, 'dist/issues-github.js'))).toBe(true);
            expect(result).toEqual({
                success: true,
                failedFiles: []
            });
        }

        {
            // Compile one file
            const result = await compileAllFiles({ fullPath: dir, debug: true, scriptName: 'contacts', providerConfigKey: 'hubspot', type: 'syncs' });
            expect(result).toEqual({
                success: true,
                failedFiles: []
            });
        }
    });
});
