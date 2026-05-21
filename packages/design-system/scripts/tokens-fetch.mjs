#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sync design tokens between Figma and git.
 *
 * npm run tokens:fetch  → fetch latest tokens from GitHub design/tokens branch + rebuild CSS
 * npm run tokens:build  → rebuild CSS from existing tokens.json (no fetch)
 *
 * Sync workflow:
 *   Designer edits tokens in Figma via Tokens Studio plugin → Push to design/tokens branch
 *   Developer runs tokens:fetch → fetches tokens.json → regenerates CSS → commits both
 *
 * Output files (both committed to git):
 *   packages/design-system/tokens/tokens.json          raw Tokens Studio export
 *   packages/design-system/tokens/tokens.generated.css  CSS custom properties
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { getTransforms, register } from '@tokens-studio/sd-transforms';
import * as prettier from 'prettier';
import StyleDictionary from 'style-dictionary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_DIR = path.resolve(__dirname, '../tokens');
const BUILD_ONLY = process.argv.includes('--build-only');

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/NangoHQ/nango/design/tokens/packages/design-system/tokens/tokens.json';

// ─── GitHub fetch ──────────────────────────────────────────────────────────────

async function fetchFromGitHub() {
    console.log('Fetching tokens from GitHub (design/tokens branch)...');
    const res = await fetch(GITHUB_RAW_URL);
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`GitHub fetch ${res.status}: ${body}`);
    }
    return res.json();
}

// ─── Style Dictionary setup ────────────────────────────────────────────────────

// Register Tokens Studio transforms (ts/color/css/hexrgba, ts/size/px, etc.)
register(StyleDictionary);

// SD v5 DTCG tokens store processed values in `$value`, not `value`. The built-in
// css/variables format falls back to String($value), which gives "[object Object]"
// for boxShadow arrays. We use a custom format instead.

const SD_TRANSFORMS = [...getTransforms(), 'name/kebab'];

// ─── CSS value formatting ──────────────────────────────────────────────────────

/**
 * Convert a token's `$value` to a CSS string.
 * Handles boxShadow arrays that the built-in css/variables format can't serialize.
 */
export function formatTokenValue(token) {
    // SD v5 DTCG: processed value lives in $value (aliases resolved, color transforms applied)
    const value = token.$value ?? token.value;
    const type = token['$type'] ?? token.type ?? '';

    if (type === 'boxShadow') {
        if (typeof value === 'string') return value; // already a CSS string (e.g. elevation.*)
        const shadows = Array.isArray(value) ? value : [value];
        if (shadows.length === 0) return 'none';
        return shadows
            .map((s) => {
                if (!s || typeof s === 'string') return s ?? 'none';
                const inset = s.type === 'innerShadow' ? 'inset ' : '';
                return `${inset}${s.x ?? 0}px ${s.y ?? 0}px ${s.blur ?? 0}px ${s.spread ?? 0}px ${s.color ?? 'transparent'}`;
            })
            .join(', ');
    }

    return String(value ?? '');
}

// ─── SD build pass ─────────────────────────────────────────────────────────────

/**
 * Run one Style Dictionary build pass and return the resolved, transformed tokens.
 * SD handles alias resolution, color normalization, and naming.
 */
async function resolveTokens({ sourceFiles, includeFiles = [] }) {
    const sd = new StyleDictionary({
        include: includeFiles,
        source: sourceFiles,
        platforms: {
            // We don't actually need a platform to produce output — we just want
            // the resolved token dictionary. Use a no-op format.
            noop: {
                transforms: SD_TRANSFORMS,
                buildPath: '/dev/null/',
                files: []
            }
        },
        log: { verbosity: 'silent', errors: { brokenReferences: 'warn' } }
    });

    // getPlatformTokens resolves aliases and applies transforms for the given platform
    const tokens = await sd.getPlatformTokens('noop');

    const resolved = [];
    for (const t of tokens.allTokens) {
        // Exclude tokens from `include` files (primitives passed into semantic builds for alias
        // resolution). Only emit tokens that originated in the current pass's `source` files —
        // primitives get their own pass, so we don't want them duplicated in semantic blocks.
        //
        // Tokens Studio stores `$description` metadata fields as pseudo-tokens with $type:'other'
        // and a path segment starting with '$' (e.g. ['surface', '$description']).
        // Skip those — but keep real semantic tokens that happen to have $type:'other' (e.g.
        // motion aliases like spinner.motion.duration that resolve to a duration value).
        if (!t.isSource) continue;
        if (t['$type'] === 'other' && t.path.some((s) => s.startsWith('$'))) continue;
        const value = t.$value ?? t.value;
        // Skip tokens with unresolved aliases — SD couldn't find the referenced token.
        // These would produce invalid CSS (e.g. `--foo: {text.muted}`) and crash prettier.
        if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
            console.warn(`⚠ Skipping ${t.path.join('.')} — unresolved alias: ${value}`);
            continue;
        }
        resolved.push(t);
    }
    return resolved;
}

// ─── CSS section builders ──────────────────────────────────────────────────────

export function buildCssBlock(tokens, selector) {
    const vars = tokens.map((t) => `  --${t.name}: ${formatTokenValue(t)};`);
    return `${selector} {\n${vars.join('\n')}\n}`;
}

export function buildPrimitivesBlock(tokens) {
    // Primitives use --ds- prefix to avoid collision with legacy --color-* vars
    const vars = tokens.map((t) => {
        return `  --ds-${t.name}: ${formatTokenValue(t)};`;
    });
    return `:root {\n${vars.join('\n')}\n}`;
}

export function buildTailwindThemeBlock(tokens) {
    // Only semantic color tokens → Tailwind utility classes (bg-*, text-*, border-*, etc.)
    const vars = tokens.filter((t) => t['$type'] === 'color').map((t) => `  --color-${t.name}: var(--${t.name});`);
    return `@theme {\n${vars.join('\n')}\n}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function buildCss(tokensData) {
    const { Primitives, 'Semantic/Light': SemanticLight, 'Semantic/Dark': SemanticDark } = tokensData;

    if (!Primitives || !SemanticLight || !SemanticDark) {
        const found = Object.keys(tokensData)
            .filter((k) => !k.startsWith('$'))
            .join(', ');
        throw new Error(`Expected Primitives, Semantic/Light, and Semantic/Dark in tokens.json. Found: ${found}`);
    }

    // Write token sets to temp files for SD to consume.
    // SD requires file paths — it can't accept raw objects.
    const tmpDir = path.join(os.tmpdir(), `ds-tokens-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const primFile = path.join(tmpDir, 'primitives.json');
    const lightFile = path.join(tmpDir, 'semantic-light.json');
    const darkFile = path.join(tmpDir, 'semantic-dark.json');
    writeFileSync(primFile, JSON.stringify(Primitives, null, 2));
    writeFileSync(lightFile, JSON.stringify(SemanticLight, null, 2));
    writeFileSync(darkFile, JSON.stringify(SemanticDark, null, 2));

    let primTokens, lightTokens, darkTokens;
    try {
        [primTokens, lightTokens, darkTokens] = await Promise.all([
            resolveTokens({ sourceFiles: [primFile] }),
            resolveTokens({ includeFiles: [primFile], sourceFiles: [lightFile] }),
            resolveTokens({ includeFiles: [primFile], sourceFiles: [darkFile] })
        ]);
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }

    const output = [
        '/* AUTO-GENERATED — do not edit by hand. Run: npm run tokens:fetch */',
        '',
        '/*',
        ' * Primitives: raw design scale values prefixed with --ds-.',
        ' * The --ds- prefix avoids collisions with the legacy --color-* vars.',
        ' * Primitives are intentionally kept out of @theme to enforce that',
        ' * components only reach for semantic tokens, never raw primitives.',
        ' */',
        buildPrimitivesBlock(primTokens),
        '',
        '/* Semantic tokens — Light (default) */',
        buildCssBlock(lightTokens, ':root'),
        '',
        '/* Semantic tokens — Dark */',
        buildCssBlock(darkTokens, '[data-theme="dark"]'),
        '',
        '/*',
        ' * Tailwind v4 @theme registration.',
        ' * Maps semantic color vars to --color-* so Tailwind generates',
        ' * utility classes: bg-surface-canvas, text-text-strong, border-border-default, etc.',
        ' */',
        buildTailwindThemeBlock(lightTokens),
        ''
    ].join('\n');

    const cssPath = path.join(TOKENS_DIR, 'tokens.generated.css');
    const prettierConfig = await prettier.resolveConfig(cssPath);
    return prettier.format(output, { ...prettierConfig, filepath: cssPath });
}

async function main() {
    let tokensData;

    if (BUILD_ONLY) {
        const tokensPath = path.join(TOKENS_DIR, 'tokens.json');
        try {
            tokensData = JSON.parse(readFileSync(tokensPath, 'utf8'));
            console.log('Building from existing tokens.json...');
        } catch {
            throw new Error(`tokens.json not found at ${tokensPath}.\n` + 'Run `npm run tokens:fetch` to fetch from GitHub first.');
        }
    } else {
        tokensData = await fetchFromGitHub();
    }

    // Build CSS first — if SD throws, we leave the on-disk tokens.json untouched
    // so the working tree stays consistent (old tokens.json + old tokens.generated.css).
    const css = await buildCss(tokensData);

    mkdirSync(TOKENS_DIR, { recursive: true });
    if (!BUILD_ONLY) {
        writeFileSync(path.join(TOKENS_DIR, 'tokens.json'), JSON.stringify(tokensData, null, 2) + '\n');
        console.log('✓ tokens.json updated');
    }
    writeFileSync(path.join(TOKENS_DIR, 'tokens.generated.css'), css);
    console.log('✓ tokens.generated.css generated');

    if (!BUILD_ONLY) {
        console.log('\nCommit both files to update the design system:');
        console.log('  git add packages/design-system/tokens/');
        console.log('  git commit -m "chore(design-system): update tokens"');
    }
}

// Only run when invoked directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error('\n✗', err.message);
        process.exit(1);
    });
}
