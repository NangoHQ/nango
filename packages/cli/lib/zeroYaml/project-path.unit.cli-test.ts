import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveProjectPath } from './project-path.js';

describe('resolveProjectPath', () => {
    const projectRoot = path.resolve('project');

    it('returns canonical relative and absolute paths', () => {
        expect(resolveProjectPath({ projectRoot, filePath: '.\\github\\nested\\..\\functions\\fetch.ts' })).toEqual({
            absolute: path.join(projectRoot, 'github', 'functions', 'fetch.ts'),
            relative: './github/functions/fetch.ts'
        });
    });

    it.each(['../outside/secret.ts', './github/../../outside/secret.ts'])('rejects traversal outside the project: %s', (filePath) => {
        expect(resolveProjectPath({ projectRoot, filePath })).toBeNull();
    });

    it('rejects absolute paths', () => {
        expect(resolveProjectPath({ projectRoot, filePath: path.resolve(projectRoot, 'github/functions/fetch.ts') })).toBeNull();
    });
});
