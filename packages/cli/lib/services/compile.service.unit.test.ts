import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFileToCompile, listFilesToCompile } from './compile.service';
import { fileURLToPath } from 'node:url';

const thisFolder = path.dirname(fileURLToPath(import.meta.url));

describe('listFiles', () => {
    it('should list files with glob', () => {
        const files = listFilesToCompile({ fullPath: thisFolder, config: [] });
        expect(files.length).toBeGreaterThan(1);
        expect(files[0]).toStrictEqual({
            baseName: 'verification.service',
            inputPath: `${thisFolder}/verification.service.ts`,
            outputPath: `${thisFolder}/dist/verification.service.js`
        });
    });

    it('should list files with syncName', () => {
        const files = listFilesToCompile({ scriptName: 'compile.service', scriptDirectory: '', fullPath: thisFolder, config: [] });
        expect(files.length).toBe(1);
        expect(files[0]).toStrictEqual({
            baseName: 'compile.service',
            inputPath: `${thisFolder}/compile.service.ts`,
            outputPath: `${thisFolder}/dist/compile.service.js`
        });
    });

    it('should list files in subdirectory', () => {
        const parent = path.join(thisFolder, '..');
        const files = listFilesToCompile({ scriptName: 'compile.service', fullPath: parent, scriptDirectory: 'services', config: [] });
        expect(files.length).toBe(1);
        expect(files[0]).toStrictEqual({
            baseName: 'compile.service',
            inputPath: `${parent}/services/compile.service.ts`,
            outputPath: `${parent}/dist/compile.service.js`
        });
    });

    it('should add correct invalid path ', () => {
        const file = getFileToCompile({ filePath: 'foobar.ts', fullPath: thisFolder });
        expect(file).toStrictEqual({
            baseName: 'foobar',
            inputPath: 'foobar.ts',
            outputPath: `${thisFolder}/dist/foobar.js`
        });
    });
});
