import { describe, expect, it } from 'vitest';

import {
    checkChangedFiles,
    compareHooksIndex,
    compareProviderMaps,
    evaluate,
    HOOKS_INDEX_FILE,
    parseNameStatus,
    PROVIDERS_FILE,
    SCOPES_FILE
} from './auto-approve-new-providers.mjs';

const BASE_PROVIDERS = `
github:
    display_name: GitHub
    auth_mode: OAUTH2
    proxy:
        base_url: https://api.github.com
slack:
    display_name: Slack
    auth_mode: OAUTH2
`;

const BASE_SCOPES = `
github:
    - repo
slack: []
`;

const BASE_HOOKS_INDEX = `export { default as githubPostConnection } from './providers/github/post-connection.js';
export { default as slackPostConnection } from './providers/slack/post-connection.js';
`;
const HOOKS_DIR = 'packages/server/lib/hooks/connection/providers';
const ACME_EXPORT = "export { default as acmeCredentialsVerification } from './providers/acme/credentials-verification.js';";

function run({ files, providers = BASE_PROVIDERS, scopes = BASE_SCOPES, hooksIndex = BASE_HOOKS_INDEX }) {
    const base = { [PROVIDERS_FILE]: BASE_PROVIDERS, [SCOPES_FILE]: BASE_SCOPES, [HOOKS_INDEX_FILE]: BASE_HOOKS_INDEX };
    const head = { [PROVIDERS_FILE]: providers, [SCOPES_FILE]: scopes, [HOOKS_INDEX_FILE]: hooksIndex };
    return evaluate({ files, readBase: (p) => base[p], readHead: (p) => head[p] });
}

describe('checkChangedFiles', () => {
    it('allows docs, the provider files and new logos', () => {
        expect(
            checkChangedFiles([
                { status: 'A', path: 'docs/api-integrations/acme.mdx' },
                { status: 'M', path: 'docs/docs.json' },
                { status: 'M', path: PROVIDERS_FILE },
                { status: 'M', path: SCOPES_FILE },
                { status: 'A', path: 'packages/webapp/public/images/template-logos/acme.svg' }
            ])
        ).toEqual([]);
    });

    it('rejects files outside the allowed paths', () => {
        expect(checkChangedFiles([{ status: 'M', path: 'packages/shared/lib/index.ts' }])).toHaveLength(1);
    });

    it('rejects changes to existing logos', () => {
        expect(checkChangedFiles([{ status: 'M', path: 'packages/webapp/public/images/template-logos/github.svg' }])).toHaveLength(1);
        expect(checkChangedFiles([{ status: 'D', path: 'packages/webapp/public/images/template-logos/github.svg' }])).toHaveLength(1);
    });

    it('rejects deleting a provider file', () => {
        expect(checkChangedFiles([{ status: 'D', path: PROVIDERS_FILE }])).toHaveLength(1);
    });
});

describe('compareProviderMaps', () => {
    it('lists added providers', () => {
        const head = `${BASE_PROVIDERS}acme:\n    display_name: Acme\n    auth_mode: API_KEY\n`;
        expect(compareProviderMaps(BASE_PROVIDERS, head, 'providers')).toEqual({ added: ['acme'], reasons: [] });
    });

    it('ignores reordering and formatting', () => {
        const head = `acme:\n  auth_mode: API_KEY\nslack:\n  auth_mode: OAUTH2\n  display_name: Slack\ngithub:\n  proxy: { base_url: 'https://api.github.com' }\n  auth_mode: OAUTH2\n  display_name: GitHub\n`;
        expect(compareProviderMaps(BASE_PROVIDERS, head, 'providers')).toEqual({ added: ['acme'], reasons: [] });
    });

    it('flags a changed existing provider', () => {
        const head = BASE_PROVIDERS.replace('https://api.github.com', 'https://api.github.example');
        expect(compareProviderMaps(BASE_PROVIDERS, head, 'providers').reasons).toEqual(['providers: existing provider "github" was changed']);
    });

    it('flags a removed existing provider', () => {
        const head = `github:\n    display_name: GitHub\n    auth_mode: OAUTH2\n    proxy:\n        base_url: https://api.github.com\n`;
        expect(compareProviderMaps(BASE_PROVIDERS, head, 'providers').reasons).toEqual(['providers: existing provider "slack" was removed']);
    });

    it('flags a change made through a shared anchor', () => {
        const base = `common: &common\n    base_url: https://a.example\none:\n    proxy: *common\n`;
        const head = `common: &common\n    base_url: https://b.example\none:\n    proxy: *common\n`;
        expect(compareProviderMaps(base, head, 'providers').reasons).toEqual([
            'providers: existing provider "common" was changed',
            'providers: existing provider "one" was changed'
        ]);
    });
});

describe('evaluate', () => {
    it('approves a PR that only adds a provider, its scopes, docs and logo', () => {
        const result = run({
            files: [
                { status: 'M', path: PROVIDERS_FILE },
                { status: 'M', path: SCOPES_FILE },
                { status: 'A', path: 'docs/api-integrations/acme.mdx' },
                { status: 'A', path: 'packages/webapp/public/images/template-logos/acme.svg' }
            ],
            providers: `${BASE_PROVIDERS}acme:\n    display_name: Acme\n    auth_mode: API_KEY\n`,
            scopes: `${BASE_SCOPES}acme: []\n`
        });
        expect(result).toEqual({ approve: true, added: ['acme'], reasons: [] });
    });

    it('does not approve when an existing provider is edited alongside a new one', () => {
        const result = run({
            files: [{ status: 'M', path: PROVIDERS_FILE }],
            providers: `${BASE_PROVIDERS.replace('display_name: Slack', 'display_name: Slack v2')}acme:\n    auth_mode: API_KEY\n`
        });
        expect(result.approve).toBe(false);
        expect(result.reasons).toEqual([`${PROVIDERS_FILE}: existing provider "slack" was changed`]);
    });

    it('does not approve when existing scopes change', () => {
        const result = run({
            files: [
                { status: 'M', path: PROVIDERS_FILE },
                { status: 'M', path: SCOPES_FILE }
            ],
            providers: `${BASE_PROVIDERS}acme:\n    auth_mode: API_KEY\n`,
            scopes: BASE_SCOPES.replace('- repo', '- repo\n    - user')
        });
        expect(result.approve).toBe(false);
        expect(result.reasons).toEqual([`${SCOPES_FILE}: existing provider "github" was changed`]);
    });

    it('does not approve when no provider is added', () => {
        const result = run({ files: [{ status: 'M', path: SCOPES_FILE }], scopes: `${BASE_SCOPES}acme: []\n` });
        expect(result.approve).toBe(false);
        expect(result.reasons).toEqual([`${SCOPES_FILE}: scopes for "acme", which this PR doesn't add`, `no new provider added to ${PROVIDERS_FILE}`]);
    });

    it('does not approve when other code changes', () => {
        const result = run({
            files: [
                { status: 'M', path: PROVIDERS_FILE },
                { status: 'M', path: 'packages/server/lib/server.ts' }
            ],
            providers: `${BASE_PROVIDERS}acme:\n    auth_mode: API_KEY\n`
        });
        expect(result.approve).toBe(false);
        expect(result.reasons).toEqual(['packages/server/lib/server.ts is outside the allowed paths']);
    });

    it('approves a new provider with its post-connection and credentials-verification hooks', () => {
        const result = run({
            files: [
                { status: 'M', path: PROVIDERS_FILE },
                { status: 'M', path: HOOKS_INDEX_FILE },
                { status: 'A', path: `${HOOKS_DIR}/acme/credentials-verification.ts` },
                { status: 'A', path: `${HOOKS_DIR}/acme/post-connection.ts` },
                { status: 'A', path: `${HOOKS_DIR}/acme/types.ts` }
            ],
            providers: `${BASE_PROVIDERS}acme:\n    auth_mode: API_KEY\n`,
            hooksIndex: `${BASE_HOOKS_INDEX}${ACME_EXPORT}\nexport { default as acmePostConnection } from './providers/acme/post-connection.js';\n`
        });
        expect(result).toEqual({ approve: true, added: ['acme'], reasons: [] });
    });

    it('does not approve a hook for a provider the PR does not add', () => {
        const result = run({
            files: [
                { status: 'M', path: PROVIDERS_FILE },
                { status: 'A', path: `${HOOKS_DIR}/github/credentials-verification.ts` }
            ],
            providers: `${BASE_PROVIDERS}acme:\n    auth_mode: API_KEY\n`
        });
        expect(result.approve).toBe(false);
        expect(result.reasons).toEqual([`${HOOKS_DIR}/github/credentials-verification.ts: hook for "github", which this PR doesn't add`]);
    });

    it('does not approve edits to an existing hook', () => {
        const result = run({
            files: [
                { status: 'M', path: PROVIDERS_FILE },
                { status: 'M', path: `${HOOKS_DIR}/acme/post-connection.ts` }
            ],
            providers: `${BASE_PROVIDERS}acme:\n    auth_mode: API_KEY\n`
        });
        expect(result.approve).toBe(false);
    });

    it('does not approve other files in a hook folder', () => {
        const result = run({
            files: [
                { status: 'M', path: PROVIDERS_FILE },
                { status: 'A', path: `${HOOKS_DIR}/acme/pre-connection-deletion.ts` }
            ],
            providers: `${BASE_PROVIDERS}acme:\n    auth_mode: API_KEY\n`
        });
        expect(result.approve).toBe(false);
        expect(result.reasons).toEqual([`${HOOKS_DIR}/acme/pre-connection-deletion.ts is outside the allowed paths`]);
    });
});

describe('compareHooksIndex', () => {
    it('allows new export lines for added providers, in any position', () => {
        const head = `${ACME_EXPORT}\n${BASE_HOOKS_INDEX}`;
        expect(compareHooksIndex(BASE_HOOKS_INDEX, head, ['acme'])).toEqual([]);
    });

    it('flags an export for a provider the PR does not add', () => {
        expect(compareHooksIndex(BASE_HOOKS_INDEX, `${BASE_HOOKS_INDEX}${ACME_EXPORT}\n`, [])).toEqual([
            `${HOOKS_INDEX_FILE}: export for "acme", which this PR doesn't add`
        ]);
    });

    it('flags a removed or edited existing line', () => {
        const head = BASE_HOOKS_INDEX.replace('slackPostConnection', 'slackPostConnectionV2');
        expect(compareHooksIndex(BASE_HOOKS_INDEX, head, ['acme'])).toHaveLength(2);
    });

    it('flags any other added line', () => {
        expect(compareHooksIndex(BASE_HOOKS_INDEX, `${BASE_HOOKS_INDEX}import fs from 'node:fs';\n`, ['acme'])).toEqual([
            `${HOOKS_INDEX_FILE}: unexpected line: import fs from 'node:fs';`
        ]);
    });

    it('flags an export pointing at a file other than a hook script', () => {
        const line = "export { default as acmeTypes } from './providers/acme/types.js';";
        expect(compareHooksIndex(BASE_HOOKS_INDEX, `${BASE_HOOKS_INDEX}${line}\n`, ['acme'])).toEqual([`${HOOKS_INDEX_FILE}: unexpected line: ${line}`]);
    });
});

describe('parseNameStatus', () => {
    it('reports a rename as deleting the old path and adding the new one', () => {
        expect(parseNameStatus('R100\tpackages/shared/lib/secret.ts\tdocs/secret.ts\nM\tdocs/a.mdx\n')).toEqual([
            { status: 'D', path: 'packages/shared/lib/secret.ts' },
            { status: 'A', path: 'docs/secret.ts' },
            { status: 'M', path: 'docs/a.mdx' }
        ]);
    });

    it('rejects moving a code file into docs', () => {
        expect(checkChangedFiles(parseNameStatus('R100\tpackages/shared/lib/secret.ts\tdocs/secret.ts'))).toEqual([
            'packages/shared/lib/secret.ts is outside the allowed paths'
        ]);
    });

    it('reports a copy as adding the new path', () => {
        expect(parseNameStatus('C90\tdocs/a.mdx\tdocs/b.mdx')).toEqual([{ status: 'A', path: 'docs/b.mdx' }]);
    });
});

describe('scopes for providers the PR does not add', () => {
    it('does not approve a scope entry for a provider that is not added', () => {
        const result = run({
            files: [
                { status: 'M', path: PROVIDERS_FILE },
                { status: 'M', path: SCOPES_FILE }
            ],
            providers: `${BASE_PROVIDERS}acme:\n    auth_mode: API_KEY\n`,
            scopes: `${BASE_SCOPES}acme: []\nother: [admin]\n`
        });
        expect(result.approve).toBe(false);
        expect(result.reasons).toEqual([`${SCOPES_FILE}: scopes for "other", which this PR doesn't add`]);
    });
});

describe('provider key validation', () => {
    it('rejects a new provider key that could inject workflow output', () => {
        const head = `${BASE_PROVIDERS}"acme\\napprove=true":\n    auth_mode: API_KEY\n`;
        const result = compareProviderMaps(BASE_PROVIDERS, head, 'providers');
        expect(result.added).toEqual([]);
        expect(result.reasons).toHaveLength(1);
    });

    it('accepts plain slugs', () => {
        const head = `${BASE_PROVIDERS}acme-v2_beta:\n    auth_mode: API_KEY\n`;
        expect(compareProviderMaps(BASE_PROVIDERS, head, 'providers')).toEqual({ added: ['acme-v2_beta'], reasons: [] });
    });
});
