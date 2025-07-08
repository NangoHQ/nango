import fs from 'node:fs';
import path, { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { init } from './init.service.js';
import { exampleSyncName } from '../constants.js';
import { getTestDirectory, removeVersion } from '../tests/helpers.js';

describe('init', () => {
    const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    afterEach(() => {
        consoleMock.mockReset();
    });

    it('should init the expected files in the nango-integrations directory', async () => {
        const dir = await getTestDirectory('init');
        init({ absolutePath: path.resolve(dir), debug: false });
        expect(fs.existsSync(join(dir, '.nango'))).toBe(true);
        expect(fs.existsSync(join(dir, '.nango/.gitkeep'))).toBe(true);
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
});
