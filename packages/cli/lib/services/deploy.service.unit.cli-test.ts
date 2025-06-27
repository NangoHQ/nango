import fs from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { compileAllFiles } from './compile.service.js';
import { parse } from './config.service.js';
import deployService from './deploy.service.js';
import { copyDirectoryAndContents, fixturesPath, getTestDirectory, removeVersion } from '../tests/helpers.js';

describe('package', () => {
    let dir: string;

    beforeAll(async () => {
        dir = await getTestDirectory('deploy-nested');

        await fs.promises.rm(dir, { recursive: true, force: true });
        await fs.promises.mkdir(dir, { recursive: true });

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/nested-integrations/hubspot`, `${dir}/hubspot`);
        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/nested-integrations/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/nested-integrations/nango.yaml`, `${dir}/nango.yaml`);

        // Compile only once
        const result = await compileAllFiles({ fullPath: dir, debug: false });
        expect(result).toEqual({
            success: true,
            failedFiles: []
        });
    });

    it('should package correctly', () => {
        const parsing = parse(dir);
        if (parsing.isErr()) {
            throw parsing.error;
        }

        const res = deployService.package({ parsed: parsing.value.parsed!, debug: false, fullPath: dir });
        expect(removeVersion(JSON.stringify(res!.jsonSchema, null, 2))).toMatchSnapshot();
        expect(
            res?.flowConfigs.map((flow) => {
                return {
                    ...flow,
                    fileBody: {
                        ts: flow.fileBody.ts,
                        // Remove tsup comments
                        js: flow.fileBody.js.replaceAll(/\/\/.*/g, '')
                    }
                };
            })
        ).toMatchSnapshot();
    });

    it('should filter by integrationId when specified', () => {
        const parsing = parse(dir);
        if (parsing.isErr()) {
            throw parsing.error;
        }

        // Test with hubspot only provided
        const resHubspot = deployService.package({
            parsed: parsing.value.parsed!,
            debug: false,
            fullPath: dir,
            integrationId: 'hubspot'
        });

        // Verify only hubspot integrations are included
        expect(resHubspot).not.toBeNull();
        expect(resHubspot!.flowConfigs.length).toBeGreaterThan(0);
        expect(resHubspot!.flowConfigs.every((flow) => flow.providerConfigKey === 'hubspot')).toBe(true);

        // Verify no github integrations are included
        expect(resHubspot!.flowConfigs.some((flow) => flow.providerConfigKey === 'github')).toBe(false);

        // Test with github
        const resGithub = deployService.package({
            parsed: parsing.value.parsed!,
            debug: false,
            fullPath: dir,
            integrationId: 'github'
        });

        // Verify only github integrations are included
        expect(resGithub).not.toBeNull();
        expect(resGithub!.flowConfigs.length).toBeGreaterThan(0);
        expect(resGithub!.flowConfigs.every((flow) => flow.providerConfigKey === 'github')).toBe(true);

        // Verify no hubspot integrations are included
        expect(resGithub!.flowConfigs.some((flow) => flow.providerConfigKey === 'hubspot')).toBe(false);

        // Test with no integrationId (should include all)
        const resAll = deployService.package({
            parsed: parsing.value.parsed!,
            debug: false,
            fullPath: dir
        });

        expect(resAll).not.toBeNull();
        expect(resAll!.flowConfigs.length).toBeGreaterThan(0);

        // Verify both hubspot and github integrations are included
        const providerKeys = new Set(resAll!.flowConfigs.map((flow) => flow.providerConfigKey));
        expect(providerKeys.size).toBe(2);
        expect(providerKeys.has('hubspot')).toBe(true);
        expect(providerKeys.has('github')).toBe(true);

        expect(resAll!.flowConfigs.length).toBe(resHubspot!.flowConfigs.length + resGithub!.flowConfigs.length);
    });
});
