import { describe, expect, it } from 'vitest';
import { getFileToCompile, listFilesToCompile } from './compile.service';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const thisFolder = path.dirname(fileURLToPath(import.meta.url));

describe('listFiles', () => {
    it('should list files with glob', () => {
        const files = listFilesToCompile({ cwd: thisFolder });
        expect(files.length).toBeGreaterThan(1);
        expect(files[0]).toStrictEqual({
            baseName: 'verification.service',
            inputPath: `${thisFolder}/verification.service.ts`,
            outputPath: './dist/verification.service.js'
        });
    });

    it('should list files with syncName', () => {
        const files = listFilesToCompile({ scriptName: 'compile.service', cwd: thisFolder });
        expect(files.length).toBe(1);
        expect(files[0]).toStrictEqual({
            baseName: 'compile.service',
            inputPath: `${thisFolder}/compile.service.ts`,
            outputPath: './dist/compile.service.js'
        });
    });

    it('should add correct invalid path ', () => {
        const file = getFileToCompile('foobar.ts');
        expect(file).toStrictEqual({
            baseName: 'foobar',
            inputPath: 'foobar.ts',
            outputPath: './dist/foobar.js'
        });
    });
});
