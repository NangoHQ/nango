import { describe, expect, it } from 'vitest';
import { listFile, listFiles } from './compile.service';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const thisFolder = path.dirname(fileURLToPath(import.meta.url));

describe('listFiles', () => {
    it('should list files with glob', () => {
        const files = listFiles({ cwd: thisFolder });
        expect(files.length).toBeGreaterThan(1);
        expect(files[0]).toStrictEqual({
            baseName: 'verification.service',
            inputPath: './verification.service.ts',
            outputPath: './dist/verification.service.js'
        });
    });

    it('should list files with syncName', () => {
        const files = listFiles({ syncName: 'compile.service', cwd: thisFolder });
        expect(files.length).toBe(1);
        expect(files[0]).toStrictEqual({
            baseName: 'compile.service',
            inputPath: './compile.service.ts',
            outputPath: './dist/compile.service.js'
        });
    });

    it('should add correct invalid path ', () => {
        const file = listFile('foobar.ts');
        expect(file).toStrictEqual({
            baseName: 'foobar',
            inputPath: './foobar.ts',
            outputPath: './dist/foobar.js'
        });
    });
});
