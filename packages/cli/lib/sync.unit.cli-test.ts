import { expect, describe, it, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'fs';
import yaml from 'js-yaml';
import stripAnsi from 'strip-ansi';
import { init, generate } from './cli.js';
import { exampleSyncName } from './constants.js';
import { compileAllFiles, compileSingleFile, getFileToCompile } from './services/compile.service.js';
import { getNangoRootPath } from './utils.js';
import parserService from './services/parser.service.js';
import { copyDirectoryAndContents } from './tests/helpers.js';
import { load } from './services/config.service.js';

function getTestDirectory(name: string) {
    const dir = `/tmp/${name}/nango-integrations/`;
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(dir, { recursive: true, force: true });
    return dir;
}

describe('generate function tests', () => {
    const fixturesPath = './packages/cli/fixtures';
    // Not the best but until we have a logger it will work
    const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    afterEach(() => {
        consoleMock.mockReset();
    });

    it('should init the expected files in the nango-integrations directory', async () => {
        const dir = getTestDirectory('init');
        init({ absolutePath: path.resolve(dir, '..'), debug: false });
        expect(fs.existsSync(`${dir}/demo-github-integration/syncs/${exampleSyncName}.ts`)).toBe(true);
        expect(fs.existsSync(`${dir}/.env`)).toBe(true);
        expect(fs.existsSync(`${dir}/nango.yaml`)).toBe(true);
    });

    it('should not overwrite existing integration files', async () => {
        const dir = getTestDirectory('overwrite');
        init({ absolutePath: dir, debug: false });
        await fs.promises.writeFile(`${dir}/${exampleSyncName}.ts`, 'dummy fake content', 'utf8');

        const dummyContent = 'This is dummy content. Do not overwrite!';
        const exampleFilePath = path.join(dir, `${exampleSyncName}.ts`);
        await fs.promises.writeFile(exampleFilePath, dummyContent, 'utf8');

        init({ absolutePath: dir });

        expect(fs.existsSync(exampleFilePath)).toBe(true);
        const fileContentAfterInit = await fs.promises.readFile(exampleFilePath, 'utf8');
        expect(fileContentAfterInit).toBe(dummyContent);
    });

    it('should generate a different sync correctly', async () => {
        const dir = getTestDirectory('generate');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');
        generate({ debug: true, fullPath: dir });
        expect(fs.existsSync(`${dir}/demo-github-integration/syncs/some-other-sync.ts`)).toBe(true);
    });

    it('should support a single model return in v1 format', async () => {
        const dir = getTestDirectory('single-model-v1');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(`${dir}/demo-github-integration/syncs/single-model-return.ts`)).toBe(true);
    });

    it('should support a single model return in v2 format', async () => {
        const dir = getTestDirectory('single-model-v2');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(`${dir}/demo-github-integration/syncs/single-model-return.ts`)).toBe(true);
    });

    it('should not create a file if endpoint is missing from a v2 config', async () => {
        const dir = getTestDirectory('endpoint-missing-v2');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');
        expect(fs.existsSync(`${dir}/demo-github-integration/syncs/single-model-return.ts`)).toBe(false);
    });

    it('should generate missing from a v2 config', async () => {
        const dir = getTestDirectory('v2-incremental-compile');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(`${dir}/demo-github-integration/syncs/single-model-issue-output.ts`)).toBe(true);
    });

    it('should throw an error if a model is missing an id that is actively used', async () => {
        const dir = getTestDirectory('missing-id');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');

        const acc: string[] = [];
        consoleMock.mockImplementation((m) => acc.push(stripAnsi(m)));
        generate({ debug: false, fullPath: dir });

        expect(acc).toStrictEqual([
            'demo-github-integration > syncs > single-model-return > [output]',
            '  error Model "GithubIssue" doesn\'t have an id field. This is required to be able to uniquely identify the data record [model_missing_id]',
            '',
            'Your nango.yaml contains some errors'
        ]);
    });

    it('should allow models to end with an "s"', async () => {
        const dir = getTestDirectory('model-with-an-s');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
        const modelsFile = await fs.promises.readFile(`${dir}/models.ts`, 'utf8');
        expect(modelsFile).toContain('export interface GithubIssues');
    });

    it('should not throw an error if a model is missing an id for an action', async () => {
        const dir = getTestDirectory('missing-id-action');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
    });

    it('should allow javascript primitives as a return type with no model', async () => {
        const dir = getTestDirectory('model-returns-primitives');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');
        generate({ debug: false, fullPath: dir });
    });

    it('should catch non javascript primitives in the config', async () => {
        const dir = getTestDirectory('model-returns-invalid-primitives');
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
        await fs.promises.writeFile(`${dir}/nango.yaml`, yamlData, 'utf8');
        expect(generate({ debug: false, fullPath: dir })).toBeUndefined();
    });

    it('should not complain of try catch not being awaited', () => {
        const awaiting = parserService.callsAreUsedCorrectly(`${fixturesPath}/sync.ts`, 'sync', ['GithubIssue']);
        expect(awaiting).toBe(true);
    });

    it('should complain when a return statement is used', () => {
        const noReturnUsed = parserService.callsAreUsedCorrectly(`${fixturesPath}/return-sync.ts`, 'sync', ['GithubIssue']);
        expect(noReturnUsed).toBe(false);
    });

    it('should not complain when a return statement is used but does not return anything', () => {
        const noReturnUsed = parserService.callsAreUsedCorrectly(`${fixturesPath}/void-return-sync.ts`, 'sync', ['GithubIssue']);
        expect(noReturnUsed).toBe(true);
    });

    it('should not complain when a return statement is used in a nested function', () => {
        const noReturnUsed = parserService.callsAreUsedCorrectly(`${fixturesPath}/nested-return-sync.ts`, 'sync', ['GreenhouseEeoc']);
        expect(noReturnUsed).toBe(true);
    });

    it('should complain of a non try catch not being awaited', () => {
        const awaiting = parserService.callsAreUsedCorrectly(`${fixturesPath}/failing-sync.ts`, 'sync', ['GithubIssue']);
        expect(awaiting).toBe(false);
    });

    it('should not complain about a correct model', () => {
        const usedCorrectly = parserService.callsAreUsedCorrectly(`${fixturesPath}/bad-model.ts`, 'sync', ['SomeBadModel']);
        expect(usedCorrectly).toBe(true);
    });

    it('should not complain about awaiting when it is returned for an action', () => {
        const awaiting = parserService.callsAreUsedCorrectly(`${fixturesPath}/no-async-return.ts`, 'action', ['SomeModel']);
        expect(awaiting).toBe(true);
    });

    it('should complain about an incorrect model', () => {
        const awaiting = parserService.callsAreUsedCorrectly(`${fixturesPath}/bad-model.ts`, 'sync', ['GithubIssue']);
        expect(awaiting).toBe(false);
    });

    it('should complain if retryOn is used without retries', () => {
        const usedCorrectly = parserService.callsAreUsedCorrectly(`${fixturesPath}/retry-on-bad.ts`, 'sync', ['GithubIssue']);
        expect(usedCorrectly).toBe(false);
    });

    it('should not complain if retryOn is used with retries', () => {
        const usedCorrectly = parserService.callsAreUsedCorrectly(`${fixturesPath}/retry-on-good.ts`, 'sync', ['GithubIssue']);
        expect(usedCorrectly).toBe(false);
    });

    it('should be able to compile files in nested directories', async () => {
        const dir = getTestDirectory('nested');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/nested-integrations/hubspot`, `${dir}/hubspot`);
        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/nested-integrations/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/nested-integrations/nango.yaml`, `${dir}/nango.yaml`);

        const success = await compileAllFiles({ fullPath: dir, debug: true });

        expect(fs.existsSync(path.join(dir, 'models.ts'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'hubspot/syncs/contacts.ts'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'dist/contacts-hubspot.js'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'dist/issues-github.js'))).toBe(true);

        expect(success).toBe(true);
    });

    it('should be backwards compatible with the single directory for integration files', async () => {
        const dir = getTestDirectory('old-directory');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/non-nested-integrations`, dir);

        const success = await compileAllFiles({ fullPath: dir, debug: false });

        expect(fs.existsSync(path.join(dir, 'models.ts'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'contacts.ts'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'dist/contacts-hubspot.js'))).toBe(true);
        expect(success).toBe(true);
    });

    it('should be able to compile and run imported files', async () => {
        const dir = getTestDirectory('relative-imports');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/relative-imports/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/relative-imports/nango.yaml`, `${dir}/nango.yaml`);

        const success = await compileAllFiles({ fullPath: dir, debug: false });

        const module = await import(`${dir}dist/issues-github.js`);

        const result = module.default.default();
        expect(result).toBe('Hello, world!');

        expect(success).toBe(true);
    });

    it('should compile helper functions and throw an error if there is a complication error with an imported file', async () => {
        const name = 'relative-imports-with-error';
        const dir = getTestDirectory('relative-imports-with-error');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/${name}/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/${name}/nango.yaml`, `${dir}/nango.yaml`);
        const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

        const { response: parsed } = load(path.resolve(`${fixturesPath}/nango-yaml/v2/${name}`));
        expect(parsed).not.toBeNull();

        const result = await compileSingleFile({
            fullPath: dir,
            file: getFileToCompile({ fullPath: dir, filePath: path.join(dir, './github/actions/gh-issues.ts') }),
            tsconfig,
            parsed: parsed!,
            debug: false
        });
        expect(result).toBe(false);
    });

    it('should complain if a nango call is used incorrectly in a nested file', async () => {
        const name = 'relative-imports-with-nango-misuse';
        const dir = getTestDirectory('relative-imports-with-nango-misuse');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/${name}/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/${name}/nango.yaml`, `${dir}/nango.yaml`);
        const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

        const { response: parsed } = load(path.resolve(`${fixturesPath}/nango-yaml/v2/${name}`));
        expect(parsed).not.toBeNull();

        const result = await compileSingleFile({
            fullPath: dir,
            file: getFileToCompile({ fullPath: dir, filePath: path.join(dir, './github/actions/gh-issues.ts') }),
            tsconfig,
            parsed: parsed!,
            debug: false
        });
        expect(result).toBe(false);
    });

    it('should not allow imports higher than the current directory', async () => {
        const name = 'relative-imports-with-higher-import';
        const dir = getTestDirectory('relative-imports-with-higher-import');
        init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/${name}/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/${name}/nango.yaml`, `${dir}/nango.yaml`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/${name}/github/actions/welcomer.ts`, `${dir}/welcomer.ts`);
        const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

        const { response: parsed } = load(path.resolve(`${fixturesPath}/nango-yaml/v2/${name}`));
        expect(parsed).not.toBeNull();

        const result = await compileSingleFile({
            fullPath: dir,
            file: getFileToCompile({ fullPath: dir, filePath: path.join(dir, './github/actions/gh-issues.ts') }),
            tsconfig,
            parsed: parsed!,
            debug: false
        });
        expect(result).toBe(false);
    });
});
