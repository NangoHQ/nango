import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, describe, expect, it } from 'vitest';

// paths.ts uses resolveLocalFilePath which captures basePath at module load time from utils.ts.
// Fix it to a known tmp dir so localPaths tests are deterministic.
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nango-paths-'));
process.env['NANGO_INTEGRATIONS_FULL_PATH'] = TMP_ROOT;

const { catalogPaths, deployedPaths, localPaths, scriptTypeToPath } = await import('./paths.js');

afterAll(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe('paths.ts', () => {
    describe('scriptTypeToPath', () => {
        it('maps every script type to its folder name', () => {
            expect(scriptTypeToPath.sync).toBe('syncs');
            expect(scriptTypeToPath.action).toBe('actions');
            expect(scriptTypeToPath['on-event']).toBe('on-events');
            expect(scriptTypeToPath.webhook).toBe('syncs');
        });
    });

    describe('deployedPaths', () => {
        it('builds the JS key matching the legacy inline string', () => {
            const key = deployedPaths.js({
                env: 'dev',
                accountId: 42,
                environmentId: 99,
                configId: 17,
                scriptName: 'get-users',
                version: '1.0.0'
            });
            expect(key).toBe('dev/account/42/environment/99/config/17/get-users-v1.0.0.js');
        });

        it('builds the TS key without version', () => {
            const key = deployedPaths.ts({
                env: 'prod',
                accountId: 1,
                environmentId: 2,
                configId: 3,
                scriptName: 'fetch'
            });
            expect(key).toBe('prod/account/1/environment/2/config/3/fetch.ts');
        });

        it('builds the nango.yaml key at environment scope', () => {
            const key = deployedPaths.nangoYaml({ env: 'staging', accountId: 5, environmentId: 7 });
            expect(key).toBe('staging/account/5/environment/7/nango.yaml');
        });

        it('dirOf strips the file segment from a JS file_location', () => {
            expect(deployedPaths.dirOf('dev/account/1/environment/2/config/3/fn-v1.0.0.js')).toBe('dev/account/1/environment/2/config/3');
        });

        it('envRootOf strips /config/{id}/{file} from a JS file_location', () => {
            expect(deployedPaths.envRootOf('dev/account/1/environment/2/config/3/fn-v1.0.0.js')).toBe('dev/account/1/environment/2');
        });
    });

    describe('localPaths', () => {
        it('js resolves to ${basePath}/${scriptName}-${providerConfigKey}.js', () => {
            expect(localPaths.js({ scriptName: 'my-sync', providerConfigKey: 'github' })).toBe(path.join(TMP_ROOT, 'my-sync-github.js'));
        });

        it('tsNested resolves to ${basePath}/${providerConfigKey}/${typeFolder}/${scriptName}.ts for each type', () => {
            expect(localPaths.tsNested({ providerConfigKey: 'gh', scriptType: 'sync', scriptName: 'n' })).toBe(path.join(TMP_ROOT, 'gh/syncs/n.ts'));
            expect(localPaths.tsNested({ providerConfigKey: 'gh', scriptType: 'action', scriptName: 'n' })).toBe(path.join(TMP_ROOT, 'gh/actions/n.ts'));
            expect(localPaths.tsNested({ providerConfigKey: 'gh', scriptType: 'on-event', scriptName: 'n' })).toBe(path.join(TMP_ROOT, 'gh/on-events/n.ts'));
            expect(localPaths.tsNested({ providerConfigKey: 'gh', scriptType: 'webhook', scriptName: 'n' })).toBe(path.join(TMP_ROOT, 'gh/syncs/n.ts'));
        });

        it('tsFlat resolves to ${basePath}/${scriptName}.ts', () => {
            expect(localPaths.tsFlat({ scriptName: 'plain' })).toBe(path.join(TMP_ROOT, 'plain.ts'));
        });

        it('nangoYaml resolves to ${basePath}/nango.yaml', () => {
            expect(localPaths.nangoYaml()).toBe(path.join(TMP_ROOT, 'nango.yaml'));
        });

        it('tsNestedRelative returns the relative filename (not resolved)', () => {
            expect(localPaths.tsNestedRelative({ providerConfigKey: 'gh', scriptType: 'sync', scriptName: 'n' })).toBe('gh/syncs/n.ts');
        });
    });

    describe('catalogPaths', () => {
        it('templateJs builds the pre-built catalog JS key with pluralized type', () => {
            expect(catalogPaths.templateJs({ provider: 'github', scriptType: 'sync', scriptName: 'get-repos' })).toBe(
                'templates-zero/github/build/github_syncs_get-repos.cjs'
            );
            expect(catalogPaths.templateJs({ provider: 'slack', scriptType: 'on-event', scriptName: 'install' })).toBe(
                'templates-zero/slack/build/slack_on-events_install.cjs'
            );
        });

        it('templateTs builds the catalog TS source key', () => {
            expect(catalogPaths.templateTs({ provider: 'github', scriptType: 'action', scriptName: 'create-issue' })).toBe(
                'templates-zero/github/actions/create-issue.ts'
            );
        });
    });
});
