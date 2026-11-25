#!/usr/bin/env node
/* eslint-disable no-console */
import { createHash } from 'crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.resolve(__dirname, '../tokens/tokens.json');
const RUNTIME_PATH = path.resolve(__dirname, 'tokens-figma-runtime.js');
const OUT_DIR = path.join(os.tmpdir(), `ds-figma-sync-${createHash('sha256').update(TOKENS_PATH).digest('hex').slice(0, 8)}`);

export const FIGMA_FILE_KEY = 'T8aoiWC73uCiM5eucb0syk';
// use_figma rejects code over 50,000 characters.
const CHUNK_BUDGET = 49000;
const EM_PX = 16;

const PRIMITIVES = 'Primitives';
const THEMES = ['Dark', 'Light'];
const SEMANTIC_COLLECTION = 'Colors';
const TEXT_STYLE_THEME = 'Light';

const ALIAS_RE = /^\{([^}]+)\}$/;

export function aliasTarget(value) {
    const match = typeof value === 'string' ? ALIAS_RE.exec(value) : null;
    return match ? match[1] : null;
}

export function toFigmaName(tokenPath) {
    return tokenPath.split('.').join('/');
}

const round = (n) => Math.round(n * 10000) / 10000;

export function parseColor(value) {
    const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
    if (hex) {
        const int = parseInt(hex[1], 16);
        return {
            r: round(((int >> 16) & 255) / 255),
            g: round(((int >> 8) & 255) / 255),
            b: round((int & 255) / 255),
            a: hex[2] ? round(parseInt(hex[2], 16) / 255) : 1
        };
    }
    const rgba = /^rgba?\(([^)]+)\)$/i.exec(value);
    if (rgba) {
        const [r, g, b, a = '1'] = rgba[1].split(',').map((s) => s.trim());
        const channels = [r, g, b, a].map(Number);
        if (channels.some((n) => !Number.isFinite(n))) throw new Error(`Unsupported color: ${value}`);
        return { r: round(channels[0] / 255), g: round(channels[1] / 255), b: round(channels[2] / 255), a: round(channels[3]) };
    }
    throw new Error(`Unsupported color: ${value}`);
}

export function parseDimension(value) {
    if (typeof value === 'number') return value;
    const match = /^(-?[\d.]+)(px|em|rem)?$/.exec(String(value).trim());
    if (!match) throw new Error(`Unsupported dimension: ${value}`);
    const n = Number(match[1]);
    return match[2] === 'em' || match[2] === 'rem' ? round(n * EM_PX) : n;
}

// Figma TIMING variables hold seconds.
export function parseDuration(value) {
    const match = /^(-?[\d.]+)(ms|s)$/.exec(String(value).trim());
    if (!match) throw new Error(`Unsupported duration: ${value}`);
    return match[2] === 'ms' ? Number(match[1]) / 1000 : Number(match[1]);
}

export function parseCubicBezier(value) {
    const match = /^cubic-bezier\(([^)]+)\)$/.exec(String(value).trim());
    if (!match) throw new Error(`Unsupported cubic-bezier: ${value}`);
    const [x1, y1, x2, y2] = match[1].split(',').map((s) => Number(s.trim()));
    return { type: 'CUSTOM_CUBIC_BEZIER', easingFunctionCubicBezier: { x1, y1, x2, y2 } };
}

export function firstFontFamily(value) {
    return String(value).split(',')[0].trim();
}

export function toVariableValue(type, value) {
    switch (type) {
        case 'color':
            return { type: 'COLOR', value: parseColor(value) };
        case 'dimension':
            return { type: 'FLOAT', value: parseDimension(value) };
        case 'number':
        case 'fontWeights':
            return { type: 'FLOAT', value: Number(value) };
        case 'opacity':
            return { type: 'FLOAT', value: round(Number(value) * 100) };
        case 'fontFamilies':
            return { type: 'STRING', value: firstFontFamily(value) };
        case 'duration':
            return { type: 'TIMING', value: parseDuration(value) };
        case 'cubicBezier':
            return { type: 'EASING', value: parseCubicBezier(value) };
        default:
            throw new Error(`No Figma variable type for token type '${type}'`);
    }
}

// These helpers are also serialized into the Figma payload, so they must not reference anything outside themselves.
export function num(n) {
    return Number(Number(n).toFixed(3));
}

export function hexOf(color) {
    const a = color.a === undefined ? 1 : color.a;
    return (
        '#' +
        [color.r, color.g, color.b, a]
            .map((c) =>
                Math.round(c * 255)
                    .toString(16)
                    .padStart(2, '0')
            )
            .join('')
    );
}

export function hashOf(value) {
    const text = JSON.stringify(value);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

const SHARED_HELPERS = [num, hexOf, hashOf].map((fn) => fn.toString()).join('\n');

export function flattenTokens(set) {
    const out = [];
    const walk = (node, segments) => {
        if (!node || typeof node !== 'object') return;
        if ('$type' in node && '$value' in node) {
            if (segments.some((s) => s.startsWith('$'))) return;
            out.push({ path: segments.join('.'), type: node.$type, value: node.$value, description: node.$description ?? '' });
            return;
        }
        for (const [key, child] of Object.entries(node)) {
            if (!key.startsWith('$')) walk(child, [...segments, key]);
        }
    };
    walk(set, []);
    return out;
}

function makeResolver(sets) {
    const index = new Map();
    for (const set of sets) {
        for (const token of flattenTokens(set)) {
            if (!index.has(token.path)) index.set(token.path, token);
        }
    }
    const resolve = (value, seen = new Set()) => {
        const target = aliasTarget(value);
        if (!target) return value;
        if (seen.has(target)) throw new Error(`Alias cycle at ${target}`);
        const token = index.get(target);
        if (!token) throw new Error(`Unresolved alias {${target}}`);
        return resolve(token.value, new Set([...seen, target]));
    };
    return { resolve, has: (p) => index.has(p) };
}

function modeValue(token, resolver) {
    const target = aliasTarget(token.value);
    if (target) {
        if (!resolver.has(target)) throw new Error(`${token.path}: unresolved alias {${target}}`);
        return { alias: toFigmaName(target) };
    }
    const { type, value } = toVariableValue(token.type, token.value);
    return { value: type === 'COLOR' ? hexOf(value) : value };
}

export function parseCssShadows(value) {
    if (value.trim() === 'none') return [];
    return value.split(/,(?![^(]*\))/).map((part) => {
        const color = /(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i.exec(part)?.[0];
        const inset = /\binset\b/.test(part);
        const [x = '0', y = '0', blur = '0', spread = '0'] = part
            .replace(color ?? '', '')
            .replace('inset', '')
            .trim()
            .split(/\s+/);
        return { x, y, blur, spread, color, type: inset ? 'innerShadow' : 'dropShadow' };
    });
}

export function toShadowList(value, resolver) {
    const resolved = resolver.resolve(value);
    const parsed = typeof resolved === 'string' ? parseCssShadows(resolved) : resolved;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    // CSS paints the first shadow on top; Figma paints the last effect on top.
    return list
        .map((shadow) => {
            const colorAlias = aliasTarget(shadow.color);
            return {
                type: shadow.type === 'innerShadow' ? 'INNER_SHADOW' : 'DROP_SHADOW',
                x: parseDimension(shadow.x ?? 0),
                y: parseDimension(shadow.y ?? 0),
                blur: parseDimension(shadow.blur ?? 0),
                spread: parseDimension(shadow.spread ?? 0),
                color: parseColor(resolver.resolve(shadow.color)),
                colorAlias: colorAlias ? toFigmaName(colorAlias) : null
            };
        })
        .reverse();
}

function lastSegment(tokenPath) {
    const parts = tokenPath.split('.');
    return parts[parts.length - 1];
}

const VARIABLE_TYPE_BY_TOKEN_TYPE = {
    color: 'COLOR',
    dimension: 'FLOAT',
    number: 'FLOAT',
    fontWeights: 'FLOAT',
    opacity: 'FLOAT',
    fontFamilies: 'STRING',
    duration: 'TIMING',
    cubicBezier: 'EASING'
};

export function buildDesiredState(tokens) {
    const primitives = tokens[PRIMITIVES];
    const typography = tokens.Typography;
    if (!primitives || !typography) throw new Error('tokens.json needs Primitives and Typography sets');

    const errors = [];
    const variables = [];
    const effectStyles = [];
    const variable = (collection, token, valuesByMode) => ({
        collection,
        name: toFigmaName(token.path),
        type: VARIABLE_TYPE_BY_TOKEN_TYPE[token.type],
        description: token.description,
        valuesByMode
    });
    const effectStyle = (theme, token, resolver) => {
        try {
            return {
                kind: 'effect',
                theme,
                path: token.path,
                name: `${theme}/${lastSegment(token.path)}`,
                description: token.description,
                effects: toShadowList(token.value, resolver)
            };
        } catch (err) {
            throw new Error(`${token.path}: ${err.message}`);
        }
    };

    const primitiveResolver = makeResolver([primitives]);
    for (const token of flattenTokens(primitives)) {
        try {
            if (token.type === 'boxShadow') {
                effectStyles.push(effectStyle(PRIMITIVES, token, primitiveResolver));
            } else {
                variables.push(variable(PRIMITIVES, token, { [PRIMITIVES]: modeValue(token, primitiveResolver) }));
            }
        } catch (err) {
            errors.push(err.message);
        }
    }

    const semantic = new Map();
    for (const themeName of THEMES) {
        const set = tokens[`Semantic/${themeName}`];
        if (!set) throw new Error(`tokens.json needs a Semantic/${themeName} set`);
        const resolver = makeResolver([set, primitives]);
        for (const token of flattenTokens(set)) {
            try {
                if (token.type === 'boxShadow') {
                    effectStyles.push(effectStyle(themeName, token, resolver));
                    continue;
                }
                const entry = semantic.get(token.path) ?? { token, modes: {} };
                entry.modes[themeName] = modeValue(token, resolver);
                if (themeName === TEXT_STYLE_THEME) entry.token = token;
                semantic.set(token.path, entry);
            } catch (err) {
                errors.push(`${themeName}: ${err.message}`);
            }
        }
    }
    for (const [tokenPath, entry] of semantic) {
        const missing = THEMES.filter((t) => !entry.modes[t]);
        if (missing.length > 0) {
            errors.push(`${tokenPath} is missing from Semantic/${missing.join(', Semantic/')}`);
            continue;
        }
        variables.push(variable(SEMANTIC_COLLECTION, entry.token, entry.modes));
    }

    const typographyResolver = makeResolver([typography, primitives]);
    const textStyles = [];
    for (const token of flattenTokens(typography)) {
        if (token.type !== 'typography') continue;
        try {
            const field = (name) => {
                const raw = token.value[name];
                const target = aliasTarget(raw);
                return { value: typographyResolver.resolve(raw), alias: target ? toFigmaName(target) : null };
            };
            const fontFamily = field('fontFamily');
            const fontWeight = field('fontWeight');
            const fontSize = field('fontSize');
            const letterSpacing = field('letterSpacing');
            textStyles.push({
                kind: 'text',
                theme: TEXT_STYLE_THEME,
                path: token.path,
                name: toFigmaName(token.path),
                description: token.description,
                fontFamily: { value: firstFontFamily(fontFamily.value), alias: fontFamily.alias },
                fontWeight: { value: Number(fontWeight.value), alias: fontWeight.alias },
                fontSize: { value: parseDimension(fontSize.value), alias: fontSize.alias },
                lineHeightPercent: round(Number(field('lineHeight').value) * 100),
                letterSpacing: { value: parseDimension(letterSpacing.value), alias: letterSpacing.alias }
            });
        } catch (err) {
            errors.push(`Typography ${token.path}: ${err.message}`);
        }
    }

    const collections = [
        { name: PRIMITIVES, modes: [PRIMITIVES] },
        { name: SEMANTIC_COLLECTION, modes: THEMES }
    ];

    const styles = [...effectStyles, ...textStyles];
    const seen = new Set();
    for (const item of [...variables.map((v) => ['variable', v.name]), ...styles.map((s) => [s.kind, s.name])]) {
        const key = item.join(' ');
        if (seen.has(key)) errors.push(`Two tokens map to the ${key} in Figma`);
        seen.add(key);
    }

    return { collections, variables, styles, errors };
}

// The runtime builds the same shapes from live Figma objects; a field added here must be added there.
export function canonicalVariable(v) {
    const values = {};
    for (const [mode, entry] of Object.entries(v.valuesByMode)) {
        if (entry.alias) values[mode] = `@${entry.alias}`;
        else if (v.type === 'COLOR' || v.type === 'STRING') values[mode] = entry.value;
        else if (v.type === 'EASING') {
            const b = entry.value.easingFunctionCubicBezier;
            values[mode] = [b.x1, b.y1, b.x2, b.y2].map(num).join(',');
        } else values[mode] = num(entry.value);
    }
    return { n: v.name, t: v.type, v: values };
}

export function canonicalStyle(s) {
    if (s.kind === 'effect') {
        return { n: s.name, e: s.effects.map((e) => [e.type, num(e.x), num(e.y), num(e.blur), num(e.spread), hexOf(e.color), e.colorAlias ?? '']) };
    }
    return {
        n: s.name,
        f: s.fontFamily.value,
        w: s.fontWeight.value,
        s: num(s.fontSize.value),
        lh: num(s.lineHeightPercent),
        ls: num(s.letterSpacing.value),
        b: [s.fontFamily.alias ?? '', s.fontWeight.alias ?? '', s.fontSize.alias ?? '', s.letterSpacing.alias ?? '']
    };
}

function payload(runtime, call) {
    return `${SHARED_HELPERS}\n${runtime}\nreturn await ${call};\n`;
}

export function buildReadPayload(desired, runtime) {
    const input = {
        collections: desired.collections,
        variables: desired.variables.map((v) => [v.collection, v.name, hashOf(canonicalVariable(v)), hashOf(v.description)]),
        styles: desired.styles.map((s) => [s.kind, s.name, hashOf(canonicalStyle(s)), hashOf(s.description)])
    };
    const code = payload(runtime, `readFigma(${JSON.stringify(input)})`);
    if (code.length > CHUNK_BUDGET) throw new Error(`Read payload is ${code.length} characters, over the ${CHUNK_BUDGET} limit`);
    return code;
}

export function buildApplyPayloads(desired, runtime, changed) {
    const wanted = new Set(changed.map((c) => `${c.kind}|${c.name}`));
    const items = [
        ...desired.variables.filter((v) => v.collection === PRIMITIVES && wanted.has(`variable|${v.name}`)).map((v) => ['variables', v]),
        ...desired.variables.filter((v) => v.collection !== PRIMITIVES && wanted.has(`variable|${v.name}`)).map((v) => ['variables', v]),
        ...desired.styles.filter((s) => wanted.has(`${s.kind}|${s.name}`)).map((s) => ['styles', s])
    ];
    const render = (chunk) => payload(runtime, `applyTokens(${JSON.stringify({ collections: desired.collections, ...chunk })})`);
    const chunks = [];
    let current = { variables: [], styles: [] };
    for (const [kind, item] of items) {
        const next = { ...current, [kind]: [...current[kind], item] };
        if (render(next).length > CHUNK_BUDGET && current.variables.length + current.styles.length > 0) {
            chunks.push(current);
            current = { variables: [], styles: [] };
            current[kind].push(item);
        } else {
            current = next;
        }
    }
    if (current.variables.length + current.styles.length > 0) chunks.push(current);
    return chunks.map(render);
}

export function describeDiff(desired, figmaState) {
    const lines = [];
    const want = new Map([
        ...desired.variables.map((v) => [`variable|${v.name}`, canonicalVariable(v)]),
        ...desired.styles.map((s) => [`${s.kind}|${s.name}`, canonicalStyle(s)])
    ]);
    for (const item of figmaState.changed ?? []) {
        const desiredCanon = want.get(`${item.kind}|${item.name}`);
        if (!desiredCanon) {
            lines.push(`! ${item.kind} ${item.name} is no longer in tokens.json; run prepare-figma-diff again`);
            continue;
        }
        if (!item.current) {
            lines.push(`+ create ${item.kind} ${item.name}`);
            continue;
        }
        const fields =
            item.current === 'description' ? [] : Object.keys(desiredCanon).filter((k) => JSON.stringify(desiredCanon[k]) !== JSON.stringify(item.current[k]));
        const parts = fields.map((k) => `${k} ${JSON.stringify(item.current[k])} → ${JSON.stringify(desiredCanon[k])}`);
        if (item.description) parts.push('description');
        lines.push(`~ ${item.kind} ${item.name}: ${parts.join('; ')}`);
    }
    for (const orphan of figmaState.orphans ?? []) lines.push(`? ${orphan.kind} ${orphan.name} is in Figma but not in tokens.json`);
    for (const error of figmaState.errors ?? []) lines.push(`! ${error}`);
    return lines;
}

function loadDesired() {
    const desired = buildDesiredState(JSON.parse(readFileSync(TOKENS_PATH, 'utf8')));
    if (desired.errors.length > 0) throw new Error(`tokens.json can't be synced:\n  ${desired.errors.join('\n  ')}`);
    return { desired, runtime: readFileSync(RUNTIME_PATH, 'utf8') };
}

function readFigma() {
    const { desired, runtime } = loadDesired();
    mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, 'prepare-figma-diff.js');
    writeFileSync(file, buildReadPayload(desired, runtime));
    console.log(`Figma file: ${FIGMA_FILE_KEY}`);
    console.log(`${desired.variables.length} variables, ${desired.styles.length} styles`);
    console.log(`\nRun with use_figma (reads only): ${file}`);
    console.log(`Save its JSON result to a file, then run: npm run tokens:figma --workspace=@nangohq/design-system -- diff <that file>`);
}

function diff([resultFile]) {
    if (!resultFile) throw new Error('Pass the file holding the prepare-figma-diff result.');
    const { desired, runtime } = loadDesired();
    const result = JSON.parse(readFileSync(path.resolve(process.env.INIT_CWD ?? process.cwd(), resultFile), 'utf8'));
    const lines = describeDiff(desired, result);
    mkdirSync(OUT_DIR, { recursive: true });
    for (const old of readdirSync(OUT_DIR).filter((f) => /^apply-\d+\.js$/.test(f))) rmSync(path.join(OUT_DIR, old));
    if (lines.length === 0) {
        console.log('✓ Figma matches tokens.json');
        return;
    }
    console.log(lines.join('\n'));
    const files = buildApplyPayloads(desired, runtime, result.changed ?? []).map((code, i) => {
        const file = path.join(OUT_DIR, `apply-${i + 1}.js`);
        writeFileSync(file, code);
        return file;
    });
    if (files.length > 0) console.log(`\nAfter approval, run in order with use_figma:\n  ${files.join('\n  ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [command, ...args] = process.argv.slice(2);
    const commands = { 'prepare-figma-diff': async () => readFigma(), diff: async () => diff(args) };
    if (!commands[command]) {
        console.error('Usage: tokens-figma.mjs prepare-figma-diff | diff <figma-state.json>');
        process.exit(1);
    }
    commands[command]().catch((err) => {
        console.error('\n✗', err.message);
        process.exit(1);
    });
}
