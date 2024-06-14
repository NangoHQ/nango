import { expect, describe, it, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { SyncConfigType } from '@nangohq/shared';
import { init, generate } from './cli.js';
import { exampleSyncName } from './constants.js';
import configService from './services/config.service.js';
import { compileAllFiles, compileSingleFile, getFileToCompile } from './services/compile.service.js';
import { getNangoRootPath } from './utils.js';
import parserService from './services/parser.service.js';
import { copyDirectoryAndContents } from './tests/helpers.js';

function getTestDirectory(name: string) {
    const dir = `/tmp/${name}/nango-integrations/`;
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(dir, { recursive: true, force: true });
    return dir;
}
describe('generate function tests', () => {
    const fixturesPath = './packages/cli/fixtures';

    beforeAll(async () => {
        if (!fs.existsSync('./packages/cli/dist/nango-sync.d.ts')) {
            await fs.promises.writeFile('./packages/cli/dist/nango-sync.d.ts', '', 'utf8');
        }
    });

    it('should init the expected files in the nango-integrations directory', async () => {
        const dir = getTestDirectory('init');
        await init({ absolutePath: path.resolve(dir, '..'), debug: false });
        expect(fs.existsSync(`${dir}/demo-github-integration/syncs/${exampleSyncName}.ts`)).toBe(true);
        expect(fs.existsSync(`${dir}/.env`)).toBe(true);
        expect(fs.existsSync(`${dir}/nango.yaml`)).toBe(true);
    });

    it('should not overwrite existing integration files', async () => {
        const dir = getTestDirectory('overwrite');
        await init({ absolutePath: dir, debug: false });
        await fs.promises.writeFile(`${dir}/${exampleSyncName}.ts`, 'dummy fake content', 'utf8');

        const dummyContent = 'This is dummy content. Do not overwrite!';
        const exampleFilePath = path.join(dir, `${exampleSyncName}.ts`);
        await fs.promises.writeFile(exampleFilePath, dummyContent, 'utf8');

        await init({ absolutePath: dir });

        expect(fs.existsSync(exampleFilePath)).toBe(true);
        const fileContentAfterInit = await fs.promises.readFile(exampleFilePath, 'utf8');
        expect(fileContentAfterInit).toBe(dummyContent);
    });

    it('should generate a different sync correctly', async () => {
        const dir = getTestDirectory('generate');
        await init({ absolutePath: dir });
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
        await generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(`${dir}/some-other-sync.ts`)).toBe(true);
    });

    it('should support a single model return in v1 format', async () => {
        const dir = getTestDirectory('single-model-v1');
        await init({ absolutePath: dir });
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
        await generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(`${dir}/single-model-return.ts`)).toBe(true);
    });

    it('should support a single model return in v2 format', async () => {
        const dir = getTestDirectory('single-model-v2');
        await init({ absolutePath: dir });
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
        await generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(`${dir}/demo-github-integration/syncs/single-model-return.ts`)).toBe(true);
    });

    it('should not create a file if endpoint is missing from a v2 config', async () => {
        const dir = getTestDirectory('endpoint-missing-v2');
        await init({ absolutePath: dir });
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
        await init({ absolutePath: dir });
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
        await generate({ debug: false, fullPath: dir });
        expect(fs.existsSync(`${dir}/demo-github-integration/syncs/single-model-issue-output.ts`)).toBe(true);
    });

    it('should throw an error if a model is missing an id that is actively used', async () => {
        const dir = getTestDirectory('missing-id');
        await init({ absolutePath: dir });
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
        await expect(generate({ debug: false, fullPath: dir })).rejects.toThrow(
            `Model "GithubIssue" doesn't have an id field. This is required to be able to uniquely identify the data record.`
        );
    });

    it('should allow models to end with an "s"', async () => {
        const dir = getTestDirectory('model-with-an-s');
        await init({ absolutePath: dir });
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
        await generate({ debug: false, fullPath: dir });
        const modelsFile = await fs.promises.readFile(`${dir}/models.ts`, 'utf8');
        expect(modelsFile).toContain('export interface GithubIssues');
    });

    it('should not throw an error if a model is missing an id for an action', async () => {
        const dir = getTestDirectory('missing-id-action');
        await init({ absolutePath: dir });
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
        await generate({ debug: false, fullPath: dir });
    });

    it('should allow javascript primitives as a return type with no model', async () => {
        const dir = getTestDirectory('model-returns-primitives');
        await init({ absolutePath: dir });
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
        await generate({ debug: false, fullPath: dir });
    });

    it('should catch non javascript primitives in the config', async () => {
        const dir = getTestDirectory('model-returns-invalid-primitives');
        await init({ absolutePath: dir });
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
        expect(await generate({ debug: false, fullPath: dir })).toBeUndefined();
    });

    it('should not complain of try catch not being awaited', () => {
        const awaiting = parserService.callsAreUsedCorrectly(`${fixturesPath}/sync.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(awaiting).toBe(true);
    });

    it('should complain when a return statement is used', () => {
        const noReturnUsed = parserService.callsAreUsedCorrectly(`${fixturesPath}/return-sync.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(noReturnUsed).toBe(false);
    });

    it('should not complain when a return statement is used but does not return anything', () => {
        const noReturnUsed = parserService.callsAreUsedCorrectly(`${fixturesPath}/void-return-sync.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(noReturnUsed).toBe(true);
    });

    it('should not complain when a return statement is used in a nested function', () => {
        const noReturnUsed = parserService.callsAreUsedCorrectly(`${fixturesPath}/nested-return-sync.ts`, SyncConfigType.SYNC, ['GreenhouseEeoc']);
        expect(noReturnUsed).toBe(true);
    });

    it('should complain of a non try catch not being awaited', () => {
        const awaiting = parserService.callsAreUsedCorrectly(`${fixturesPath}/failing-sync.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(awaiting).toBe(false);
    });

    it('should not complain about a correct model', () => {
        const usedCorrectly = parserService.callsAreUsedCorrectly(`${fixturesPath}/bad-model.ts`, SyncConfigType.SYNC, ['SomeBadModel']);
        expect(usedCorrectly).toBe(true);
    });

    it('should not complain about awaiting when it is returned for an action', () => {
        const awaiting = parserService.callsAreUsedCorrectly(`${fixturesPath}/no-async-return.ts`, SyncConfigType.ACTION, ['SomeModel']);
        expect(awaiting).toBe(true);
    });

    it('should complain about an incorrect model', () => {
        const awaiting = parserService.callsAreUsedCorrectly(`${fixturesPath}/bad-model.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(awaiting).toBe(false);
    });

    it('should complain if retryOn is used without retries', () => {
        const usedCorrectly = parserService.callsAreUsedCorrectly(`${fixturesPath}/retry-on-bad.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(usedCorrectly).toBe(false);
    });

    it('should not complain if retryOn is used with retries', () => {
        const usedCorrectly = parserService.callsAreUsedCorrectly(`${fixturesPath}/retry-on-good.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(usedCorrectly).toBe(false);
    });

    it('should parse a nango.yaml file that is version 1 as expected', async () => {
        const { response: config } = await configService.load(path.resolve(__dirname, `../fixtures/nango-yaml/v1/valid`));
        expect(config).toBeDefined();
        expect(config).toMatchSnapshot();
    });

    it('v1 - should complain about commas at the end of declared types', async () => {
        const dir = getTestDirectory('v1-no-commas');
        await init({ absolutePath: dir });

        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v1/no-commas/nango.yaml`, `${dir}/nango.yaml`);
        await expect(generate({ debug: false, fullPath: dir })).rejects.toThrow(
            `Field "integer," in the model GithubIssue ends with a comma or semicolon which is not allowed.`
        );
    });

    it('v1 - should complain about semi colons at the end of declared types', async () => {
        const dir = getTestDirectory('v1-no-semi-colons');
        await init({ absolutePath: dir });

        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v1/no-semi-colons/nango.yaml`, `${dir}/nango.yaml`);
        await expect(generate({ debug: false, fullPath: dir })).rejects.toThrow(
            `Field "integer;" in the model GithubIssue ends with a comma or semicolon which is not allowed.`
        );
    });

    it('should parse a nango.yaml file that is version 2 as expected', async () => {
        const { response: config } = await configService.load(path.resolve(__dirname, `../fixtures/nango-yaml/v2/valid`));
        expect(config).toBeDefined();
        expect(config).toMatchSnapshot();
    });

    it('should throw a validation error on a nango.yaml file that is not formatted correctly -- missing endpoint', async () => {
        const { response: config, error } = await configService.load(path.resolve(__dirname, `../fixtures/nango-yaml/v2/invalid.1`));
        expect(config).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toMatchSnapshot();
    });

    it('should throw a validation error on a nango.yaml file that is not formatted correctly -- webhook subscriptions are not allowed in an action', async () => {
        const { response: config, error } = await configService.load(path.resolve(__dirname, `../fixtures/nango-yaml/v2/invalid.2`));
        expect(config).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toEqual('Problem validating the nango.yaml file.');
    });

    it('should correctly interpret a string union literal type', async () => {
        const dir = getTestDirectory('validation-string-union');
        await init({ absolutePath: dir });

        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/string-literal/nango.yaml`, `${dir}/nango.yaml`);
        await expect(generate({ debug: false, fullPath: dir })).resolves.toBeUndefined();
        const modelsFile = await fs.promises.readFile(`${dir}/models.ts`, 'utf8');
        expect(modelsFile).toContain(`gender: 'male' | 'female';`);
    });

    it('should correctly interpret a union literal type with a string and a primitive', async () => {
        const dir = getTestDirectory('validation-string-primitve');
        await init({ absolutePath: dir });

        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/mixed-literal/nango.yaml`, `${dir}/nango.yaml`);
        await expect(generate({ debug: false, fullPath: dir })).resolves.toBeUndefined();
        const modelsFile = await fs.promises.readFile(`${dir}/models.ts`, 'utf8');
        expect(modelsFile).toContain(`gender: 'male' | null;`);
    });

    it('should correctly interpret a union literal type with a string and a model', async () => {
        const dir = getTestDirectory('validation-string-model');
        await init({ absolutePath: dir });

        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/mixed-literal-model/nango.yaml`, `${dir}/nango.yaml`);
        await expect(generate({ debug: false, fullPath: dir })).resolves.toBeUndefined();
        const modelsFile = await fs.promises.readFile(`${dir}/models.ts`, 'utf8');
        expect(modelsFile).toContain(`gender: 'male' | Other`);
        expect(modelsFile).toContain(`user: User | Account`);
    });

    it('should correctly interpret a union types, array types, and record types', async () => {
        const dir = getTestDirectory('validation-array-records');
        await init({ absolutePath: dir });

        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/mixed-types/nango.yaml`, `${dir}/nango.yaml`);
        await expect(generate({ debug: false, fullPath: dir })).resolves.toBeUndefined();
        const modelsFile = await fs.promises.readFile(`${dir}/models.ts`, 'utf8');
        expect(modelsFile).toContain(`record: Record<string, string>;`);
        expect(modelsFile).toContain(`und: string | null | undefined;`);
        expect(modelsFile).toContain(`def: 'male' | string | null | undefined;`);
        expect(modelsFile).toContain(`reference: Other[];`);
        expect(modelsFile).toContain(`nullableDate: Date | null;`);
    });

    it('should correctly interpret a union type with an array model', async () => {
        const dir = getTestDirectory('validation-array-model');
        await init({ absolutePath: dir });

        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/model-array-types/nango.yaml`, `${dir}/nango.yaml`);
        await expect(generate({ debug: false, fullPath: dir })).resolves.toBeUndefined();
        const modelsFile = await fs.promises.readFile(`${dir}/models.ts`, 'utf8');
        expect(modelsFile).not.toContain(`'Other[]' | null | undefined;`);
        expect(modelsFile).toContain(`Other[] | null | undefined;`);
    });

    it('should be able to compile files in nested directories', async () => {
        const dir = getTestDirectory('nested');
        await init({ absolutePath: dir });

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
        await init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/non-nested-integrations`, dir);

        const success = await compileAllFiles({ fullPath: dir, debug: false });

        expect(fs.existsSync(path.join(dir, 'models.ts'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'contacts.ts'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'dist/contacts-hubspot.js'))).toBe(true);
        expect(success).toBe(true);
    });

    it('should be able to compile and run imported files', async () => {
        const dir = getTestDirectory('relative-imports');
        await init({ absolutePath: dir });

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
        await init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/${name}/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/${name}/nango.yaml`, `${dir}/nango.yaml`);
        const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

        const { response: config } = await configService.load(path.resolve(`${fixturesPath}/nango-yaml/v2/${name}`));
        expect(config).not.toBeNull();
        const modelNames = configService.getModelNames(config!);
        const result = await compileSingleFile({
            fullPath: dir,
            file: getFileToCompile({ fullPath: dir, filePath: path.join(dir, './github/actions/gh-issues.ts') }),
            tsconfig,
            config: config!,
            modelNames,
            debug: false
        });
        expect(result).toBe(false);
    });

    it('should complain if a nango call is used incorrectly in a nested file', async () => {
        const name = 'relative-imports-with-nango-misuse';
        const dir = getTestDirectory('relative-imports-with-nango-misuse');
        await init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/${name}/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/${name}/nango.yaml`, `${dir}/nango.yaml`);
        const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

        const { response: config } = await configService.load(path.resolve(`${fixturesPath}/nango-yaml/v2/${name}`));
        expect(config).not.toBeNull();
        const modelNames = configService.getModelNames(config!);
        const result = await compileSingleFile({
            fullPath: dir,
            file: getFileToCompile({ fullPath: dir, filePath: path.join(dir, './github/actions/gh-issues.ts') }),
            tsconfig,
            config: config!,
            modelNames,
            debug: false
        });
        expect(result).toBe(false);
    });

    it('should not allow imports higher than the current directory', async () => {
        const name = 'relative-imports-with-higher-import';
        const dir = getTestDirectory('relative-imports-with-higher-import');
        await init({ absolutePath: dir });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/${name}/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/${name}/nango.yaml`, `${dir}/nango.yaml`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/${name}/github/actions/welcomer.ts`, `${dir}/welcomer.ts`);
        const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

        const { response: config } = await configService.load(path.resolve(`${fixturesPath}/nango-yaml/v2/${name}`));
        expect(config).not.toBeNull();
        const modelNames = configService.getModelNames(config!);
        const result = await compileSingleFile({
            fullPath: dir,
            file: getFileToCompile({ fullPath: dir, filePath: path.join(dir, './github/actions/gh-issues.ts') }),
            tsconfig,
            config: config!,
            modelNames,
            debug: false
        });
        expect(result).toBe(false);
    });
});
