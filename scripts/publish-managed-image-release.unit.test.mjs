import { describe, expect, it } from 'vitest';

import {
    buildGitHubComparisonUrl,
    buildReleaseNotes,
    normalizeManifestForPublish,
    parseGitHubCompareUrl,
    resolveComparisonUrl
} from './publish-managed-image-release.mjs';

const PREV_COMMIT = '8ad36940476ad129a6450dd152636498d4d2285f';
const CURRENT_COMMIT = '0fe07a6d83aea0becc4cea382c5cead2f555718d';

describe('parseGitHubCompareUrl', () => {
    it('parses a GitHub compare URL', () => {
        expect(parseGitHubCompareUrl(`https://github.com/NangoHQ/nango/compare/${PREV_COMMIT}...${CURRENT_COMMIT}`)).toEqual({
            owner: 'NangoHQ',
            repo: 'nango',
            from: PREV_COMMIT,
            to: CURRENT_COMMIT
        });
    });
});

describe('buildGitHubComparisonUrl', () => {
    it('returns null when both commits are the same', () => {
        expect(buildGitHubComparisonUrl(CURRENT_COMMIT, CURRENT_COMMIT, 'NangoHQ', 'nango')).toBeNull();
    });
});

describe('resolveComparisonUrl', () => {
    it('keeps a valid manifest comparison URL', () => {
        const comparisonUrl = `https://github.com/NangoHQ/nango/compare/${PREV_COMMIT}...${CURRENT_COMMIT}`;

        expect(resolveComparisonUrl(comparisonUrl, PREV_COMMIT, CURRENT_COMMIT)).toBe(comparisonUrl);
    });

    it('rebuilds the compare URL from the previous release commit when the manifest URL is empty', () => {
        const emptyRange = `https://github.com/NangoHQ/nango/compare/${CURRENT_COMMIT}...${CURRENT_COMMIT}`;

        expect(resolveComparisonUrl(emptyRange, PREV_COMMIT, CURRENT_COMMIT)).toBe(
            `https://github.com/NangoHQ/nango/compare/${PREV_COMMIT}...${CURRENT_COMMIT}`
        );
    });

    it('returns null when there is no previous release commit', () => {
        expect(resolveComparisonUrl(null, null, CURRENT_COMMIT)).toBeNull();
    });
});

describe('normalizeManifestForPublish', () => {
    it('rewrites latest.comparisonUrl before publishing to customers', () => {
        const manifest = {
            latest: {
                imageVersion: '2.0.0',
                appVersion: '0.71.0',
                commitHash: CURRENT_COMMIT,
                comparisonUrl: `https://github.com/NangoHQ/nango/compare/${CURRENT_COMMIT}...${CURRENT_COMMIT}`
            },
            history: [{ commitHash: PREV_COMMIT }]
        };

        expect(normalizeManifestForPublish(manifest, PREV_COMMIT, CURRENT_COMMIT).latest.comparisonUrl).toBe(
            `https://github.com/NangoHQ/nango/compare/${PREV_COMMIT}...${CURRENT_COMMIT}`
        );
    });
});

describe('buildReleaseNotes', () => {
    const TAG_NAME = `managed-2.0.0-0.71.0-${CURRENT_COMMIT}`;
    const DIGEST = 'sha256:3f1c2a9d0b7e4f6a8c5d2e1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f';
    const CERT_IDENTITY = 'https://github.com/NangoHQ/nango/.github/workflows/managed-release.yaml@refs/heads/master';
    const CERT_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
    const baseInput = {
        manifest: { latest: { releaseDate: '2026-11-19T00:00:00.000Z', comparisonUrl: null } },
        cliffNotes: '- a change',
        tagName: TAG_NAME,
        imageVersion: '2.0.0',
        appVersion: '0.71.0',
        prevCommit: PREV_COMMIT,
        currentCommitHash: CURRENT_COMMIT
    };

    it('includes the digest and a cosign verify command for the signing identity', () => {
        const notes = buildReleaseNotes({ ...baseInput, imageDigest: DIGEST, certIdentity: CERT_IDENTITY, certOidcIssuer: CERT_OIDC_ISSUER });

        expect(notes).toContain(`- **Image digest:** \`${DIGEST}\``);
        expect(notes).toContain(
            [
                `cosign verify nangohq/nango@${DIGEST} \\`,
                `  --certificate-identity ${CERT_IDENTITY} \\`,
                `  --certificate-oidc-issuer ${CERT_OIDC_ISSUER}`
            ].join('\n')
        );
        expect(notes.indexOf('### Verify the image')).toBeLessThan(notes.indexOf('### Changes'));
    });

    it('leaves out the verify section when there is no digest to verify', () => {
        const notes = buildReleaseNotes({ ...baseInput, certIdentity: CERT_IDENTITY, certOidcIssuer: CERT_OIDC_ISSUER });

        expect(notes).not.toContain('cosign verify');
    });

    it('leaves out the digest and verify section when the image was not signed', () => {
        const notes = buildReleaseNotes(baseInput);

        expect(notes).not.toContain('Image digest');
        expect(notes).not.toContain('cosign verify');
        expect(notes).toContain('### Changes');
    });
});
