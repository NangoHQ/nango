import { expect, describe, it, afterEach, beforeAll } from 'vitest';
import path from 'path';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { SyncConfigType } from '@nangohq/shared';
import { init, generate } from './cli.js';
import { exampleSyncName } from './constants.js';
import configService from './services/config.service.js';
import { compileAllFiles } from './services/compile.service.js';
import ParserService from './services/parser.service.js';

const copyDirectoryAndContents = async (source: string, destination: string) => {
    await fs.promises.mkdir(destination, { recursive: true });

    const files = await fs.promises.readdir(source, { withFileTypes: true });

    for (const file of files) {
        const sourcePath = path.join(source, file.name);
        const destinationPath = path.join(destination, file.name);

        if (file.isDirectory()) {
            await copyDirectoryAndContents(sourcePath, destinationPath);
        } else {
            await fs.promises.copyFile(sourcePath, destinationPath);
        }
    }
};

describe('generate function tests', () => {
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

    it('should init the expected files in the nango-integrations directory', async () => {
        await init();
        expect(fs.existsSync(`./${testDirectory}/demo-github-integration/syncs/${exampleSyncName}.ts`)).toBe(true);
        expect(fs.existsSync(`./${testDirectory}/.env`)).toBe(true);
        expect(fs.existsSync(`./${testDirectory}/nango.yaml`)).toBe(true);
    });

    it('should not overwrite existing integration files', async () => {
        await fs.promises.rm(testDirectory, { recursive: true, force: true });
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await fs.promises.writeFile(`${testDirectory}/${exampleSyncName}.ts`, 'dummy fake content', 'utf8');

        const dummyContent = 'This is dummy content. Do not overwrite!';
        const exampleFilePath = path.join(testDirectory, `${exampleSyncName}.ts`);
        await fs.promises.writeFile(exampleFilePath, dummyContent, 'utf8');

        await init();

        expect(fs.existsSync(exampleFilePath)).toBe(true);
        const fileContentAfterInit = await fs.promises.readFile(exampleFilePath, 'utf8');
        expect(fileContentAfterInit).toBe(dummyContent);
    });

    it('should generate a different sync correctly', async () => {
        await init();
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        await generate(false, true);
        expect(fs.existsSync(`${testDirectory}/some-other-sync.ts`)).toBe(true);
    });

    it('should support a single model return in v1 format', async () => {
        await init();
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        await generate(false, true);
        expect(fs.existsSync(`${testDirectory}/single-model-return.ts`)).toBe(true);
    });

    it('should support a single model return in v2 format', async () => {
        await init();
        const data = {
            integrations: {
                'demo-github-integration': {
                    syncs: {
                        'single-model-return': {
                            type: 'sync',
                            runs: 'every half hour',
                            endpoint: '/issues',
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        await generate(false, true);
        expect(fs.existsSync(`${testDirectory}/demo-github-integration/syncs/single-model-return.ts`)).toBe(true);
    });

    it('should not create a file if endpoint is missing from a v2 config', async () => {
        await init();
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        expect(fs.existsSync(`${testDirectory}/demo-github-integration/syncs/single-model-return.ts`)).toBe(false);
    });

    it('should generate missing from a v2 config', async () => {
        await init();
        const data = {
            integrations: {
                'demo-github-integration': {
                    syncs: {
                        'single-model-issue-output': {
                            type: 'sync',
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        await generate(false, true);
        expect(fs.existsSync(`${testDirectory}/demo-github-integration/syncs/single-model-issue-output.ts`)).toBe(true);
    });

    it('should throw an error if a model is missing an id that is actively used', async () => {
        await init();
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        await expect(generate(false, true)).rejects.toThrow(
            `Model "GithubIssue" doesn't have an id field. This is required to be able to uniquely identify the data record.`
        );
    });

    it('should allow models to end in an s', async () => {
        await init();
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        await generate(false, true);
        const modelsFile = await fs.promises.readFile(`${testDirectory}/models.ts`, 'utf8');
        expect(modelsFile).toContain('export interface GithubIssues');
    });

    it('should not throw an error if a model is missing an id for an action', async () => {
        await init();
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        await generate(false, true);
    });

    it('should allow javascript primitives as a return type with no model', async () => {
        await init();
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        await generate(false, true);
    });

    it('should catch non javascript primitives in the config', async () => {
        await init();
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
        await fs.promises.writeFile(`${testDirectory}/nango.yaml`, yamlData, 'utf8');
        expect(await generate(false, true)).toBeUndefined();
    });

    it('should not complain of try catch not being awaited', () => {
        const parserService = new ParserService(`${fixturesPath}/sync.ts`);
        const awaiting = parserService.callsAreUsedCorrectly(SyncConfigType.SYNC, ['GithubIssue']);
        expect(awaiting).toBe(true);
    });

    it('should complain when a return statement is used', () => {
        const parserService = new ParserService(`${fixturesPath}/return-sync.ts`);
        const noReturnUsed = parserService.callsAreUsedCorrectly(SyncConfigType.SYNC, ['GithubIssue']);
        expect(noReturnUsed).toBe(false);
    });

    it('should not complain when a return statement is used but does not return anything', () => {
        const parserService = new ParserService(`${fixturesPath}/void-return-sync.ts`);
        const noReturnUsed = parserService.callsAreUsedCorrectly(SyncConfigType.SYNC, ['GithubIssue']);
        expect(noReturnUsed).toBe(true);
    });

    it('should not complain when a return statement is used in a nested function', () => {
        const parserService = new ParserService(`${fixturesPath}/nested-return-sync.ts`);
        const noReturnUsed = parserService.callsAreUsedCorrectly(SyncConfigType.SYNC, ['GreenhouseEeoc']);
        expect(noReturnUsed).toBe(true);
    });

    it('should complain of a non try catch not being awaited', () => {
        const parserService = new ParserService(`${fixturesPath}/failing-sync.ts`);
        const awaiting = parserService.callsAreUsedCorrectly(SyncConfigType.SYNC, ['GithubIssue']);
        expect(awaiting).toBe(false);
    });

    it('should not complain about a correct model', () => {
        const parserService = new ParserService(`${fixturesPath}/sync.ts`);
        const usedCorrectly = parserService.callsAreUsedCorrectly(SyncConfigType.SYNC, ['SomeBadModel']);
        expect(usedCorrectly).toBe(true);
    });

    it('should not complain about awaiting when it is returned for an action', () => {
        const parserService = new ParserService(`${fixturesPath}/async-return.ts`);
        const awaiting = parserService.callsAreUsedCorrectly(SyncConfigType.ACTION, ['SomeModel']);
        expect(awaiting).toBe(true);
    });

    it('should complain about an incorrect model', () => {
        const parserService = new ParserService(`${fixturesPath}/bad-model.ts`);
        const awaiting = parserService.callsAreUsedCorrectly(SyncConfigType.SYNC, ['GithubIssue']);
        expect(awaiting).toBe(false);
    });

    it('should complain if retryOn is used without retries', () => {
        const parserService = new ParserService(`${fixturesPath}/retry-on-bad.ts`);
        const usedCorrectly = parserService.callsAreUsedCorrectly(SyncConfigType.SYNC, ['GithubIssue']);
        expect(usedCorrectly).toBe(false);
    });

    it('should not complain if retryOn is used with retries', () => {
        const parserService = new ParserService(`${fixturesPath}/retry-on-good.ts`);
        const usedCorrectly = parserService.callsAreUsedCorrectly(SyncConfigType.SYNC, ['GithubIssue']);
        expect(usedCorrectly).toBe(false);
    });

    it('should parse a nango.yaml file that is version 1 as expected', async () => {
        const { response: config } = await configService.load(path.resolve(__dirname, `../fixtures/nango-yaml/v1/valid`));
        expect(config).toBeDefined();
        expect(config).toMatchSnapshot();
    });

    it('v1 - should complain about commas at the end of declared types', async () => {
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v1/no-commas/nango.yaml`, `${testDirectory}/nango.yaml`);
        expect(generate(false, true)).rejects.toThrow(`Field "integer," in the model GithubIssue ends with a comma or semicolon which is not allowed.`);
    });

    it('v1 - should complain about semi colons at the end of declared types', async () => {
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v1/no-semi-colons/nango.yaml`, `${testDirectory}/nango.yaml`);
        expect(generate(false, true)).rejects.toThrow(`Field "integer;" in the model GithubIssue ends with a comma or semicolon which is not allowed.`);
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
        expect(error?.message).toEqual('Problem validating the nango.yaml file.');
    });

    it('should throw a validation error on a nango.yaml file that is not formatted correctly -- webhook subscriptions are not allowed in an action', async () => {
        const { response: config, error } = await configService.load(path.resolve(__dirname, `../fixtures/nango-yaml/v2/invalid.2`));
        expect(config).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toEqual('Problem validating the nango.yaml file.');
    });

    it('should correctly interpret a string union literal type', async () => {
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/string-literal/nango.yaml`, `${testDirectory}/nango.yaml`);
        expect(generate(false, true));
        const modelsFile = await fs.promises.readFile(`${testDirectory}/models.ts`, 'utf8');
        expect(modelsFile).toContain(`gender: 'male' | 'female';`);
    });

    it('should correctly interpret a union literal type with a string and a primitive', async () => {
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/mixed-literal/nango.yaml`, `${testDirectory}/nango.yaml`);
        expect(generate(false, true));
        const modelsFile = await fs.promises.readFile(`${testDirectory}/models.ts`, 'utf8');
        expect(modelsFile).toContain(`gender: 'male' | null;`);
    });

    it('should correctly interpret a union literal type with a string and a model', async () => {
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/mixed-literal-model/nango.yaml`, `${testDirectory}/nango.yaml`);
        expect(generate(false, true));
        const modelsFile = await fs.promises.readFile(`${testDirectory}/models.ts`, 'utf8');
        expect(modelsFile).toContain(`gender: 'male' | Other`);
        expect(modelsFile).toContain(`user: User | Account`);
    });

    it('should correctly interpret a union types, array types, and record types', async () => {
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/mixed-types/nango.yaml`, `${testDirectory}/nango.yaml`);
        expect(generate(false, true));
        const modelsFile = await fs.promises.readFile(`${testDirectory}/models.ts`, 'utf8');
        expect(modelsFile).toContain(`record: Record<string, string>;`);
        expect(modelsFile).toContain(`und: string | null | undefined;`);
        expect(modelsFile).toContain(`def: 'male' | string | null | undefined;`);
        expect(modelsFile).toContain(`reference: Other[];`);
        expect(modelsFile).toContain(`nullableDate: Date | null;`);
    });

    it('should correctly interpret a union type with an array model', async () => {
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/model-array-types/nango.yaml`, `${testDirectory}/nango.yaml`);
        expect(generate(false, true));
        const modelsFile = await fs.promises.readFile(`${testDirectory}/models.ts`, 'utf8');
        expect(modelsFile).not.toContain(`'Other[]' | null | undefined;`);
        expect(modelsFile).toContain(`Other[] | null | undefined;`);
    });

    it('should be able to compile files in nested directories', async () => {
        await fs.promises.rm(testDirectory, { recursive: true, force: true });
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/nested-integrations/hubspot`, './hubspot');
        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/nested-integrations/github`, './github');
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/nested-integrations/nango.yaml`, `./nango.yaml`);

        const success = await compileAllFiles({ debug: true });

        await fs.promises.rm('./hubspot', { recursive: true, force: true });
        await fs.promises.rm('./github', { recursive: true, force: true });
        await fs.promises.rm('./dist', { recursive: true, force: true });
        await fs.promises.rm('./nango.yaml', { force: true });
        await fs.promises.rm('./models.ts', { force: true });

        expect(success).toBe(true);
    });

    it('should be backwards compatible with the single directory for integration files', async () => {
        await fs.promises.rm(testDirectory, { recursive: true, force: true });
        await fs.promises.mkdir(testDirectory, { recursive: true });
        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/non-nested-integrations`, './');

        const success = await compileAllFiles({ debug: true });

        await fs.promises.rm('./dist', { recursive: true, force: true });
        await fs.promises.rm('./nango.yaml', { force: true });
        await fs.promises.rm('./models.ts', { force: true });
        await fs.promises.rm('./contacts.ts', { force: true });
        await fs.promises.rm('./create-contact.ts', { force: true });
        await fs.promises.rm('./create-issue.ts', { force: true });
        await fs.promises.rm('./issues.ts', { force: true });

        expect(success).toBe(true);
    });
});
