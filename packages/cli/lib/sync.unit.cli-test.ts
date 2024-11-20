import { expect, describe, it, afterEach, vi } from 'vitest';
import path, { join } from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import yaml from 'js-yaml';
import stripAnsi from 'strip-ansi';
import { init, generate } from './cli.js';
import { exampleSyncName } from './constants.js';
import { compileAllFiles, compileSingleFile, getFileToCompile } from './services/compile.service.js';
import parserService from './services/parser.service.js';
import { copyDirectoryAndContents, removeVersion, fixturesPath, getTestDirectory } from './tests/helpers.js';
import { parse } from './services/config.service.js';
import { directoryMigration, endpointMigration } from './services/migration.service.js';

describe('generate function tests', () => {
    // Not the best but until we have a logger it will work
    const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    afterEach(() => {
        consoleMock.mockReset();
    });

    it('should init the expected files in the nango-integrations directory', async () => {
        const dir = await getTestDirectory('init');
        init({ absolutePath: path.resolve(dir, '..'), debug: false });
        expect(fs.existsSync(join(dir, `demo-github-integration/syncs/${exampleSyncName}.ts`))).toBe(true);
        expect(fs.existsSync(join(dir, '.env'))).toBe(true);
        expect(fs.existsSync(join(dir, 'nango.yaml'))).toBe(true);
        expect(fs.existsSync(join(dir, 'models.ts'))).toBe(true);
        expect(removeVersion(fs.readFileSync(join(dir, '.nango/schema.ts')).toString())).toMatchSnapshot();
        expect(removeVersion(fs.readFileSync(join(dir, '.nango/schema.json')).toString())).toMatchSnapshot();
    });

    it('should not overwrite existing integration files', async () => {
        const dir = await getTestDirectory('overwrite');
        init({ absolutePath: dir, debug: false });
        await fs.promises.writeFile(join(dir, `${exampleSyncName}.ts`), 'dummy fake content', 'utf8');

        const dummyContent = 'This is dummy content. Do not overwrite!';
        const exampleFilePath = join(dir, `${exampleSyncName}.ts`);
        await fs.promises.writeFile(exampleFilePath, dummyContent, 'utf8');

        init({ absolutePath: dir });

        expect(fs.existsSync(exampleFilePath)).toBe(true);
        const fileContentAfterInit = await fs.promises.readFile(exampleFilePath, 'utf8');
        expect(fileContentAfterInit).toBe(dummyContent);
    });

    it('should generate a different sync correctly', async () => {
        const dir = await getTestDirectory('generate');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    'some-other-sync': {
                        type: 'sync',
                        runs: 'every half hour',
                        returns: ['GithubIssue']
                    }
                }
            },
            models: {
                GithubIssue: {
                    id: 'integer',
                    owner: 'string',
                    repo: 'string',
                    issue_number: 'number',
                    title: 'string',
                    author: 'string',
                    author_id: 'string',
                    state: 'string',
                    date_created: 'date',
                    date_last_modified: 'date',
                    body: 'string'
                }
            }
        };
        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');
        generate({ debug: true, fullPath: dir });
        expect(fs.existsSync(join(dir, 'demo-github-integration/syncs/some-other-sync.ts'))).toBe(true);
    });

    it('should support a single model return in v1 format', async () => {
        const dir = await getTestDirectory('single-model-v1');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    'single-model-return': {
                        type: 'sync',
                        runs: 'every half hour',
                        returns: 'GithubIssue'
                    }
                }
            },
            models: {
                GithubIssue: {
                    id: 'integer',
                    owner: 'string',
                    repo: 'string',
                    issue_number: 'number',
                    title: 'string',
                    author: 'string',
                    author_id: 'string',
                    state: 'string',
                    date_created: 'date',
                    date_last_modified: 'date',
                    body: 'string'
                }
            }
        };
        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(join(dir, 'demo-github-integration/syncs/single-model-return.ts'))).toBe(true);
    });

    it('should support a single model return in v2 format', async () => {
        const dir = await getTestDirectory('single-model-v2');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    syncs: {
                        'single-model-return': {
                            runs: 'every half hour',
                            endpoint: 'GET /issues',
                            output: 'GithubIssue'
                        }
                    }
                }
            },
            models: {
                GithubIssue: {
                    id: 'integer',
                    owner: 'string',
                    repo: 'string',
                    issue_number: 'number',
                    title: 'string',
                    author: 'string',
                    author_id: 'string',
                    state: 'string',
                    date_created: 'date',
                    date_last_modified: 'date',
                    body: 'string'
                }
            }
        };
        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(join(dir, 'demo-github-integration/syncs/single-model-return.ts'))).toBe(true);
    });

    it('should not create a file if endpoint is missing from a v2 config', async () => {
        const dir = await getTestDirectory('endpoint-missing-v2');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    syncs: {
                        'single-model-return': {
                            type: 'sync',
                            runs: 'every half hour',
                            returns: 'GithubIssue'
                        }
                    }
                }
            },
            models: {
                GithubIssue: {
                    id: 'integer',
                    owner: 'string',
                    repo: 'string',
                    issue_number: 'number',
                    title: 'string',
                    author: 'string',
                    author_id: 'string',
                    state: 'string',
                    date_created: 'date',
                    date_last_modified: 'date',
                    body: 'string'
                }
            }
        };
        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');
        expect(fs.existsSync(join(dir, 'demo-github-integration/syncs/single-model-return.ts'))).toBe(false);
    });

    it('should generate missing from a v2 config', async () => {
        const dir = await getTestDirectory('v2-incremental-compile');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    syncs: {
                        'single-model-issue-output': {
                            runs: 'every half hour',
                            endpoint: 'GET /tickets/issue',
                            output: 'GithubIssue'
                        }
                    }
                }
            },
            models: {
                GithubIssue: {
                    id: 'integer',
                    owner: 'string',
                    repo: 'string',
                    issue_number: 'number',
                    title: 'string',
                    author: 'string',
                    author_id: 'string',
                    state: 'string',
                    date_created: 'date',
                    date_last_modified: 'date',
                    body: 'string'
                }
            }
        };
        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(join(dir, 'demo-github-integration/syncs/single-model-issue-output.ts'))).toBe(true);
    });

    it('should throw an error if a model is missing an id that is actively used', async () => {
        const dir = await getTestDirectory('missing-id');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    'single-model-return': {
                        type: 'sync',
                        runs: 'every half hour',
                        returns: 'GithubIssue'
                    }
                }
            },
            models: {
                GithubIssue: {
                    owner: 'string',
                    repo: 'string',
                    issue_number: 'number',
                    title: 'string',
                    author: 'string',
                    author_id: 'string',
                    state: 'string',
                    date_created: 'date',
                    date_last_modified: 'date',
                    body: 'string'
                }
            }
        };

        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');

        const acc: string[] = [];
        consoleMock.mockImplementation((m) => acc.push(typeof m === 'string' ? stripAnsi(m) : m));
        generate({ debug: false, fullPath: dir });

        expect(acc).toStrictEqual([
            'demo-github-integration > syncs > single-model-return > [output]',
            '  error Model "GithubIssue" doesn\'t have an id field. This is required to be able to uniquely identify the data record [model_missing_id]',
            '',
            'Your nango.yaml contains some errors'
        ]);
    });

    it('should allow models to end with an "s"', async () => {
        const dir = await getTestDirectory('model-with-an-s');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    'single-model-return': {
                        type: 'sync',
                        runs: 'every half hour',
                        returns: 'GithubIssues'
                    }
                }
            },
            models: {
                GithubIssues: {
                    id: 'string',
                    owner: 'string',
                    repo: 'string',
                    issue_number: 'number',
                    title: 'string',
                    author: 'string',
                    author_id: 'string',
                    state: 'string',
                    date_created: 'date',
                    date_last_modified: 'date',
                    body: 'string'
                }
            }
        };
        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
        const modelsFile = await fs.promises.readFile(join(dir, 'models.ts'), 'utf8');
        expect(modelsFile).toContain('export interface GithubIssues');
    });

    it('should not throw an error if a model is missing an id for an action', async () => {
        const dir = await getTestDirectory('missing-id-action');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    'single-model-return': {
                        type: 'action',
                        returns: 'GithubIssue'
                    }
                }
            },
            models: {
                GithubIssue: {
                    owner: 'string',
                    repo: 'string',
                    issue_number: 'number',
                    title: 'string',
                    author: 'string',
                    author_id: 'string',
                    state: 'string',
                    date_created: 'date',
                    date_last_modified: 'date',
                    body: 'string'
                }
            }
        };

        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
    });

    it('should allow javascript primitives as a return type with no model', async () => {
        const dir = await getTestDirectory('model-returns-primitives');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    'single-model-return': {
                        type: 'sync',
                        returns: 'string'
                    },
                    'single-model-return-action': {
                        type: 'action',
                        returns: 'string'
                    }
                }
            }
        };
        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
    });

    it('should catch non javascript primitives in the config', async () => {
        const dir = await getTestDirectory('model-returns-invalid-primitives');
        init({ absolutePath: dir });
        const data = {
            integrations: {
                'demo-github-integration': {
                    'single-model-return': {
                        type: 'sync',
                        returns: 'string'
                    },
                    'single-model-return-action': {
                        type: 'action',
                        returns: 'strings'
                    }
                }
            }
        };
        const yamlData = yaml.dump(data);
        await fs.promises.writeFile(join(dir, 'nango.yaml'), yamlData, 'utf8');
        expect(generate({ debug: false, fullPath: dir })).toBeUndefined();
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

        const success = await compileAllFiles({ fullPath: dir, debug: true });

        //. these should report any failed paths somehow, not just true!=false
        expect(fs.existsSync(join(dir, 'models.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'hubspot/syncs/contacts.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'dist/contacts-hubspot.js'))).toBe(true);
        expect(fs.existsSync(join(dir, 'dist/issues-github.js'))).toBe(true);

        expect(success).toBe(true);
    });

    it('should be backwards compatible with the single directory for integration files', async () => {
        const dir = await getTestDirectory('old-directory');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(join(fixturesPath, 'nango-yaml/v2/non-nested-integrations'), dir);

        const success = await compileAllFiles({ fullPath: dir, debug: false });

        expect(fs.existsSync(join(dir, 'models.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'contacts.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'dist/contacts-hubspot.js'))).toBe(true);
        expect(success).toBe(true);
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

        const success = await compileAllFiles({ fullPath: dir, debug: false });
        expect(fs.existsSync(join(dir, 'models.ts'))).toBe(true);
        expect(fs.existsSync(join(dir, 'dist/contacts-hubspot.js'))).toBe(true);

        expect(success).toBe(true);
    });

    it('should be able to compile and run imported files', async () => {
        const dir = await getTestDirectory('relative-imports');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(join(fixturesPath, 'nango-yaml/v2/relative-imports/github'), join(dir, 'github'));
        await fs.promises.copyFile(join(fixturesPath, 'nango-yaml/v2/relative-imports/nango.yaml'), join(dir, 'nango.yaml'));

        const success = await compileAllFiles({ fullPath: dir, debug: false });

        const module = await import(join(dir, 'dist/issues-github.js'));

        const result = module.default.default();
        expect(result).toBe('Hello, world!');

        expect(success).toBe(true);
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
});
