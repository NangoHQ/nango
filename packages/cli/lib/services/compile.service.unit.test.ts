import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFileToCompile, listFilesToCompile } from './compile.service';
import { fileURLToPath } from 'node:url';
import type { NangoYamlParsed } from '@nangohq/types';

const thisFolder = path.dirname(fileURLToPath(import.meta.url));

describe('listFiles', () => {
    it('should list files with glob', () => {
        const files = listFilesToCompile({ fullPath: thisFolder, parsed: { integrations: [], models: new Map(), yamlVersion: 'v2' } });
        expect(files.length).toBeGreaterThan(1);
        expect(files[0]).toStrictEqual({
            baseName: 'verification.service',
            inputPath: path.join(thisFolder, 'verification.service.ts'),
            outputPath: path.join(thisFolder, 'dist/verification.service.js')
        });
    });

    it('should list files with syncName', () => {
        const files = listFilesToCompile({ scriptName: 'compile.service', scriptDirectory: '', fullPath: thisFolder, parsed: {} as NangoYamlParsed });
        expect(files.length).toBe(1);
        expect(files[0]).toStrictEqual({
            baseName: 'compile.service',
            inputPath: path.join(thisFolder, 'compile.service.ts'),
            outputPath: path.join(thisFolder, 'dist/compile.service.js')
        });
    });

    it('should list files in subdirectory', () => {
        const parent = path.join(thisFolder, '..');
        const files = listFilesToCompile({ scriptName: 'compile.service', fullPath: parent, scriptDirectory: 'services', parsed: {} as NangoYamlParsed });
        expect(files.length).toBe(1);
        expect(files[0]).toStrictEqual({
            baseName: 'compile.service',
            inputPath: path.join(parent, 'services/compile.service.ts'),
            outputPath: path.join(parent, 'dist/compile.service.js')
        });
    });

    it('should add correct invalid path ', () => {
        const file = getFileToCompile({ filePath: 'foobar.ts', fullPath: thisFolder });
        expect(file).toStrictEqual({
            baseName: 'foobar',
            inputPath: 'foobar.ts',
            outputPath: path.join(thisFolder, 'dist/foobar.js')
        });
    });
});
