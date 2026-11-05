import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isPath, resolveEntryPoint, resolveProjectPath } from './project-path.js';

import type { ParsedEntryPoint } from './definitions.js';

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

describe('isPath', () => {
    it.each(['github/actions/fetch.ts', './fetch.ts', 'fetch.js', 'github\\actions\\fetch.ts', '/abs/fetch.ts'])('treats %s as a path', (value) => {
        expect(isPath(value)).toBe(true);
    });

    it.each(['fetch', 'fetch-issues', 'fetch_issues2'])('treats %s as a name', (value) => {
        expect(isPath(value)).toBe(false);
    });
});

describe('resolveEntryPoint', () => {
    const fullPath = path.resolve('project');
    const entryPoints: ParsedEntryPoint[] = [
        { filePath: './github/actions/legacy.ts', integrationId: 'github', type: 'action', name: 'legacy' },
        { filePath: './github/tools/getIssue.ts', integrationId: 'github', type: 'function', name: 'get_issue' },
        { filePath: './github/on-events/setup.ts', integrationId: 'github', type: 'on-event', name: 'setup' }
    ];

    it.each([
        { file: 'github/tools/getIssue.ts', name: 'get_issue' },
        { file: './github/tools/getIssue.ts', name: 'get_issue' },
        { file: 'github\\tools\\getIssue.ts', name: 'get_issue' },
        { file: 'github/tools/getIssue.js', name: 'get_issue' },
        { file: path.join(fullPath, 'github', 'tools', 'getIssue.ts'), name: 'get_issue' },
        { file: 'github/actions/legacy.ts', name: 'legacy' },
        { file: 'github/on-events/setup.ts', name: 'setup' }
    ])('resolves $file to $name', ({ file, name }) => {
        expect(resolveEntryPoint({ fullPath, file, entryPoints }).unwrap()).toMatchObject({ integrationId: 'github', name });
    });

    it.each([
        { file: '../outside.ts', message: "'../outside.ts' must be inside the project folder." },
        { file: 'github/helpers.ts', message: "'github/helpers.ts' is not a script. Make sure it is imported from index.ts." }
    ])('rejects $file', ({ file, message }) => {
        const result = resolveEntryPoint({ fullPath, file, entryPoints });
        expect(result.isErr() && result.error.message).toBe(message);
    });
});
