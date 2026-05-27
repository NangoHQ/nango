import { describe, expect, it } from 'vitest';

import { buildGitHubComparisonUrl, parseGitHubCompareUrl, resolveComparisonUrl } from './publish-managed-image-release.mjs';

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
