#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Validate that no removed design tokens are still referenced in the webapp.
 *
 * Used two ways:
 *
 *   1. As a module — imported by tokens-fetch.mjs to emit a local warning after
 *      rebuilding CSS.  The caller decides whether to exit non-zero (--strict flag).
 *
 *   2. As a CLI (npm run tokens:check) — CI entry point.  Reads the merge-base
 *      version of tokens.generated.css from git, compares it to the working-tree
 *      version, and exits 1 if any removed tokens are still referenced.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_CSS_PATH = path.resolve(__dirname, '../tokens/tokens.generated.css');
const WEBAPP_SRC_DIR = path.resolve(__dirname, '../../webapp/src');

// ─── CSS-variable extraction ───────────────────────────────────────────────────

/**
 * Return the set of CSS custom-property names *defined* in `css`.
 * Only matches definitions (i.e. `--name:`) — not `var(--name)` references.
 * Names include the leading `--`.
 */
export function extractDefinedVars(css) {
    const re = /--([a-zA-Z0-9-]+)\s*:/g;
    const vars = new Set();
    let match;
    while ((match = re.exec(css)) !== null) {
        vars.add('--' + match[1]);
    }
    return vars;
}

/**
 * Return CSS variable names present in `oldCss` but absent in `newCss`.
 *
 * Includes `--color-*` and `--shadow-*` @theme aliases: source can reference
 * them directly (e.g. `var(--color-border-muted, currentcolor)` in index.css),
 * so a removed alias must still be caught. getSearchPatterns only emits the
 * direct `var()` reference for those — their utility classes are generated from
 * the underlying semantic token, which is checked via its own entry.
 */
export function findRemovedVars(oldCss, newCss) {
    const oldVars = extractDefinedVars(oldCss);
    const newVars = extractDefinedVars(newCss);
    return [...oldVars].filter((v) => !newVars.has(v));
}

// ─── Tailwind pattern generation ───────────────────────────────────────────────

// All Tailwind v4 color utility prefixes.
const TAILWIND_COLOR_PREFIXES = [
    'accent',
    'bg',
    'border',
    'caret',
    'decoration',
    'divide',
    'fill',
    'from',
    'inset-ring',
    'inset-shadow',
    'outline',
    'placeholder',
    'ring',
    'ring-offset',
    'shadow',
    'stroke',
    'text',
    'to',
    'via'
];

// Tailwind v4 @theme primitive namespaces (`--<ns>-ds-*`) → the utility family
// each one generates, e.g. `--radius-ds-xs` registers `rounded-ds-xs` and
// `--border-width-ds-hairline` registers `border-ds-hairline`. Unlike semantic
// color tokens (which take every color prefix), each primitive namespace maps to
// exactly one utility prefix. Keys are the full namespace before `-ds-`.
const PRIMITIVE_THEME_UTILITY = {
    radius: 'rounded',
    'border-width': 'border',
    text: 'text',
    'font-weight': 'font',
    tracking: 'tracking',
    leading: 'leading'
};

/**
 * Return all literal strings to search for when a CSS variable is removed.
 *
 * The pattern set depends on how the variable is registered with Tailwind:
 *
 *  • `var(--token)` — direct reference, always searched for every variable.
 *  • Raw primitives (`--ds-*`) are kept out of @theme — no utilities.
 *  • `--color-*` / `--shadow-*` are @theme aliases whose utilities come from the
 *    underlying semantic token (searched via that token's own entry), so only the
 *    direct `var()` reference matters here.
 *  • `--<ns>-ds-*` primitive registrations map to one utility family, e.g.
 *    `--radius-ds-xs` → `rounded-ds-xs`, `--border-width-ds-hairline` →
 *    `border-ds-hairline`. The `-ds-` infix distinguishes these from semantic
 *    color tokens that share the prefix (`--text-strong` → `text-text-strong`,
 *    not a font-size utility).
 *  • Everything else is a semantic color token and takes every color prefix.
 */
export function getSearchPatterns(varName) {
    const name = varName.slice(2); // strip '--'
    const patterns = [`var(${varName})`];

    if (name.startsWith('ds-') || name.startsWith('color-') || name.startsWith('shadow-')) {
        return patterns;
    }

    // Capture the full namespace before the first `-ds-` (e.g. 'border-width').
    const nsMatch = name.match(/^(.+?)-ds-/);
    if (nsMatch && PRIMITIVE_THEME_UTILITY[nsMatch[1]]) {
        // name.slice(ns.length) keeps the leading '-ds-…', e.g. 'radius-ds-xs' -> '-ds-xs'.
        patterns.push(`${PRIMITIVE_THEME_UTILITY[nsMatch[1]]}${name.slice(nsMatch[1].length)}`);
        return patterns;
    }

    for (const prefix of TAILWIND_COLOR_PREFIXES) {
        patterns.push(`${prefix}-${name}`);
    }

    return patterns;
}

// ─── Webapp file scanning ──────────────────────────────────────────────────────

const SCAN_EXTENSIONS = new Set(['tsx', 'ts', 'css', 'html']);
const IGNORE_SEGMENTS = ['node_modules', 'dist'];

/**
 * Recursively list source files under `dir` that match SCAN_EXTENSIONS and
 * don't live in an ignored sub-path.
 */
async function listSourceFiles(dir) {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter((e) => {
            if (!e.isFile()) return false;
            const ext = path.extname(e.name).slice(1);
            if (!SCAN_EXTENSIONS.has(ext)) return false;
            if (e.name.endsWith('.d.ts')) return false;
            // parentPath is Node 20+; path is the legacy field
            const fullPath = path.join(e.parentPath ?? e.path, e.name);
            return !IGNORE_SEGMENTS.some((seg) => fullPath.includes(`${path.sep}${seg}${path.sep}`));
        })
        .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Return the 1-based line numbers in `content` where `pattern` appears at a
 * token boundary.
 *
 * A plain substring match would flag a removed token inside a longer surviving
 * one — e.g. removing `text-link` (utility `text-text-link`) would falsely match
 * `text-text-link-hover`. We require the match to be bounded by a non-`[\w-]`
 * character on each side, so trailing variants/opacity modifiers (`/50`, followed
 * by a space or quote) still match but a longer token name does not.
 */
export function getMatchingLines(content, pattern) {
    const re = new RegExp(`(?<![\\w-])${escapeRegExp(pattern)}(?![\\w-])`);
    const lines = content.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) result.push(i + 1);
    }
    return result;
}

/**
 * Scan `webappDir` for usages of every removed CSS variable.
 *
 * Returns a nested map keyed by var name → pattern → list of { file, lines }.
 * File paths are relative to the monorepo root (two levels above webappDir).
 *
 * @param {string[]} removedVars
 * @param {string} webappDir
 * @returns {Promise<Record<string, Record<string, Array<{file: string, lines: number[]}>>>>}
 */
export async function findUsages(removedVars, webappDir) {
    const files = await listSourceFiles(webappDir);
    const repoRoot = path.resolve(webappDir, '..', '..');

    // Pre-compute search patterns per variable.
    const varPatterns = new Map(removedVars.map((v) => [v, getSearchPatterns(v)]));

    /** @type {Record<string, Record<string, Array<{file: string, lines: number[]}>>>} */
    const usages = {};

    for (const filePath of files) {
        const content = readFileSync(filePath, 'utf-8');
        const relPath = path.relative(repoRoot, filePath);

        for (const [varName, patterns] of varPatterns) {
            for (const pattern of patterns) {
                if (!content.includes(pattern)) continue;
                const lines = getMatchingLines(content, pattern);
                if (lines.length === 0) continue;

                if (!usages[varName]) usages[varName] = {};
                if (!usages[varName][pattern]) usages[varName][pattern] = [];
                usages[varName][pattern].push({ file: relPath, lines });
            }
        }
    }

    return usages;
}

// ─── Reporting ─────────────────────────────────────────────────────────────────

/**
 * Pretty-print a usage report to `stream` (defaults to process.stderr).
 * Returns `true` if at least one usage was found.
 *
 * @param {Record<string, Record<string, Array<{file: string, lines: number[]}>>>} usages
 * @param {{ stream?: NodeJS.WritableStream }} options
 */
export function reportUsages(usages, { stream = process.stderr } = {}) {
    const vars = Object.keys(usages);
    if (vars.length === 0) return false;

    stream.write('\n⚠ Removed tokens still in use:\n');

    let totalHits = 0;
    for (const [varName, patterns] of Object.entries(usages)) {
        stream.write(`\n  ${varName}\n`);
        for (const [pattern, hits] of Object.entries(patterns)) {
            stream.write(`    as: ${pattern}\n`);
            for (const { file, lines } of hits) {
                for (const line of lines) {
                    stream.write(`      ${file}:${line}\n`);
                    totalHits++;
                }
            }
        }
    }

    stream.write(`\n  ${vars.length} removed token(s) with ${totalHits} usage(s) in the webapp.\n`);
    stream.write('  Update webapp references before merging.\n\n');

    return true;
}

// ─── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Diff `oldCss` vs `newCss`, scan `webappDir`, report, and return results.
 *
 * @param {{ oldCss: string, newCss: string, webappDir?: string }}
 * @returns {Promise<{ removed: string[], usages: object, hasUsages: boolean }>}
 */
export async function checkRemovedTokens({ oldCss, newCss, webappDir = WEBAPP_SRC_DIR }) {
    const removed = findRemovedVars(oldCss, newCss);
    if (removed.length === 0) {
        return { removed, usages: {}, hasUsages: false };
    }

    const usages = await findUsages(removed, webappDir);
    const hasUsages = reportUsages(usages);
    return { removed, usages, hasUsages };
}

// ─── CI entry point ────────────────────────────────────────────────────────────

async function runCi() {
    // Use the merge-base of HEAD and origin/master as baseline so the check
    // covers all commits on the branch, not just the last one.
    // Falls back to HEAD~1 for repos without a remote (e.g. shallow clones).
    let mergeBase;
    try {
        mergeBase = execFileSync('git', ['merge-base', 'HEAD', 'origin/master'], { encoding: 'utf-8' }).trim();
    } catch {
        try {
            mergeBase = execFileSync('git', ['rev-parse', 'HEAD~1'], { encoding: 'utf-8' }).trim();
        } catch {
            process.stderr.write('⚠ Could not determine baseline commit; skipping removed-token check.\n');
            process.exit(0);
        }
    }

    const cssRepoPath = 'packages/design-system/tokens/tokens.generated.css';
    let oldCss;
    try {
        oldCss = execFileSync('git', ['show', `${mergeBase}:${cssRepoPath}`], { encoding: 'utf-8' });
    } catch {
        // File didn't exist at the base commit — nothing to diff against.
        console.log('No baseline tokens.generated.css at merge-base; skipping check.');
        process.exit(0);
    }

    if (!existsSync(TOKENS_CSS_PATH)) {
        process.stderr.write(`✗ tokens.generated.css not found at ${TOKENS_CSS_PATH}.\nRun: npm run tokens:build --workspace=@nangohq/design-system\n`);
        process.exit(1);
    }
    const newCss = readFileSync(TOKENS_CSS_PATH, 'utf-8');

    const { hasUsages } = await checkRemovedTokens({ oldCss, newCss });
    process.exit(hasUsages ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runCi().catch((err) => {
        process.stderr.write(`✗ ${err.message}\n`);
        process.exit(1);
    });
}
