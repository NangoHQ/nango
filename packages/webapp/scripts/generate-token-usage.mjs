#!/usr/bin/env node
/**
 * Generates token-usage counts for the dev Token Editor's "Usage" toggle.
 *
 * The editor runs in the browser and can't read the source tree, so this build-time script greps
 * the source for each semantic colour token's usages and writes a { "--token": count } snapshot to
 * tokenUsage.generated.json, which the editor imports.
 *
 * A "usage" is a Tailwind colour utility (`bg-<token>`, `text-<token>`, `border-<token>`, …) or a
 * raw `var(--<token>)`. This is a heuristic signal, not an exact reference count: it can't see
 * dynamically-built class names or arbitrary values. Re-run with `npm run tokens:usage -w
 * packages/webapp` to refresh the snapshot.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..', '..', '..');
const tokensPath = join(repoRoot, 'packages/design-system/tokens/tokens.json');
const outPath = join(scriptDir, '..', 'src/features/tokenUsage.generated.json');

// Directories to scan for usage (component + app code), and paths to skip.
const scanDirs = ['packages/webapp/src', 'packages/connect-ui/src', 'packages/design-system/src'];
const skipDirs = new Set(['node_modules', 'dist', 'coverage', '.turbo']);
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.mdx']);
// The generated snapshot itself and token-definition files aren't "usage".
const skipFile = (p) => p.endsWith('.generated.json') || p.endsWith('.generated.css');

// Tailwind colour-utility prefixes a token can appear under.
const PREFIXES = [
    'bg',
    'text',
    'border',
    'ring',
    'ring-offset',
    'fill',
    'stroke',
    'outline',
    'from',
    'to',
    'via',
    'placeholder',
    'divide',
    'caret',
    'accent',
    'decoration',
    'shadow'
];
// Longest prefixes first — regex alternation matches left-to-right, so `ring-offset` must be tried
// before `ring` (otherwise `ring-offset-x` captures token `offset-x` and gets dropped).
const CLASS_RE = new RegExp(String.raw`\b(?:${[...PREFIXES].sort((a, b) => b.length - a.length).join('|')})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`, 'g');
const VAR_RE = /var\(\s*--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\s*\)/g;

const toKebab = (s) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

/** Collect the semantic colour tokens exactly as the editor derives them (walk Semantic/Light). */
function collectTokens() {
    const raw = JSON.parse(readFileSync(tokensPath, 'utf8'));
    const names = new Set();
    const walk = (node, path) => {
        for (const [key, value] of Object.entries(node)) {
            if (key.startsWith('$') || !value || typeof value !== 'object') continue;
            if ('$value' in value) {
                if (value.$type === 'color') names.add(path.concat(key).map(toKebab).join('-'));
            } else {
                walk(value, path.concat(key));
            }
        }
    };
    walk(raw['Semantic/Light'], []);
    return names;
}

function* walkFiles(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!skipDirs.has(entry.name)) yield* walkFiles(full);
        } else if (exts.has(extname(entry.name)) && !skipFile(full)) {
            yield full;
        }
    }
}

const tokens = collectTokens();
const counts = Object.fromEntries([...tokens].map((name) => [`--${name}`, 0]));

let filesScanned = 0;
for (const dir of scanDirs) {
    for (const file of walkFiles(join(repoRoot, dir))) {
        filesScanned++;
        const src = readFileSync(file, 'utf8');
        for (const re of [CLASS_RE, VAR_RE]) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(src))) {
                if (tokens.has(m[1])) counts[`--${m[1]}`]++;
            }
        }
    }
}

// Sort by descending count then name for a stable, readable file.
const sorted = Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
// 4-space indent to match the repo's Prettier config (so the committed snapshot isn't reformatted).
writeFileSync(outPath, JSON.stringify(sorted, null, 4) + '\n');

const used = Object.values(counts).filter((n) => n > 0).length;
console.log(`token usage: scanned ${filesScanned} files, ${tokens.size} tokens (${used} used, ${tokens.size - used} unused) → ${relative(repoRoot, outPath)}`);
