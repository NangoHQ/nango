import { expect, describe, it, afterEach, beforeAll } from 'vitest';
import path from 'path';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { SyncConfigType } from '@nangohq/shared';
import { init, generate, exampleSyncName, nangoCallsAreUsedCorrectly } from './sync.js';

describe('generate function tests', () => {
    const testDirectory = './nango-integrations';

    beforeAll(async () => {
        if (!fs.existsSync('./packages/cli/dist/nango-sync.d.ts')) {
            await fs.promises.writeFile('./packages/cli/dist/nango-sync.d.ts', '', 'utf8');
        }
    });

    afterEach(async () => {
        await fs.promises.rm(testDirectory, { recursive: true, force: true });
    });

    it('should init the expectd files in the nango-integrations directory', async () => {
        await init();
        expect(fs.existsSync(`./${testDirectory}/${exampleSyncName}.ts`)).toBe(true);
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

    it('should support a single model return', async () => {
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
        expect(generate(false, true)).rejects.toThrow(
            `Model "GithubIssue" doesn't have an id field. This is required to be able to uniquely identify the data record.`
        );
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

    it('should allow javascript primitivs as a return type with no model', async () => {
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
        expect(generate(false, true)).rejects.toThrow();
    });

    it('should not complain of try catch not being awaited', async () => {
        const filePath = './packages/cli/lib/fixtures';
        const awaiting = nangoCallsAreUsedCorrectly(`${filePath}/sync.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(awaiting).toBe(true);
    });

    it('should complain of a non try catch not being awaited', async () => {
        const filePath = './packages/cli/lib/fixtures';
        const awaiting = nangoCallsAreUsedCorrectly(`${filePath}/failing-sync.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(awaiting).toBe(false);
    });

    it('should not complain about a correct model', async () => {
        const filePath = './packages/cli/lib/fixtures';
        const usedCorrectly = nangoCallsAreUsedCorrectly(`${filePath}/bad-model.ts`, SyncConfigType.SYNC, ['SomeBadModel']);
        expect(usedCorrectly).toBe(true);
    });

    it('should complain about an incorrect model', async () => {
        const filePath = './packages/cli/lib/fixtures';
        const awaiting = nangoCallsAreUsedCorrectly(`${filePath}/bad-model.ts`, SyncConfigType.SYNC, ['GithubIssue']);
        expect(awaiting).toBe(false);
    });
});
