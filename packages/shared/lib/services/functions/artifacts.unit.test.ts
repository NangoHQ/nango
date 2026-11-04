import { describe, expect, it } from 'vitest';

import { functionArtifactPaths, functionSourceFile } from './artifacts.js';

describe('functionSourceFile', () => {
    const paths = functionArtifactPaths({
        environmentName: 'dev',
        accountId: 1,
        environmentId: 2,
        integrationId: 'github',
        name: 'create-issue',
        version: 'abc'
    });

    it('resolves the uploaded remote source from the stored compiled file location', () => {
        expect(functionSourceFile({ integrationId: 'github', name: 'create-issue', fileLocation: paths.js.destinationPath })).toEqual({
            kind: 'remote',
            path: paths.ts.destinationPath
        });
    });

    it('resolves the uploaded local source when the file was stored locally', () => {
        expect(functionSourceFile({ integrationId: 'github', name: 'create-issue', fileLocation: '_LOCAL_FILE_' })).toEqual({
            kind: 'local',
            path: paths.ts.destinationLocalFileName
        });
    });
});
