import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from './config.service.js';
import deployService from './deploy.service';
import { copyDirectoryAndContents, fixturesPath, getTestDirectory, removeVersion } from '../tests/helpers.js';
import { compileAllFiles } from './compile.service';

describe('package', () => {
    it('should package correctly', async () => {
        const dir = await getTestDirectory('deploy-nested');

        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/nested-integrations/hubspot`, `${dir}/hubspot`);
        await copyDirectoryAndContents(`${fixturesPath}/nango-yaml/v2/nested-integrations/github`, `${dir}/github`);
        await fs.promises.copyFile(`${fixturesPath}/nango-yaml/v2/nested-integrations/nango.yaml`, `${dir}/nango.yaml`);

        const success = await compileAllFiles({ fullPath: dir, debug: false });
        expect(success).toBe(true);

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
});
