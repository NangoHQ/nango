import { buttonVariantClasses } from '@nangohq/design-system';

/**
 * Contrast checking for the Token Editor.
 *
 * Foreground/background token pairs are DERIVED FROM design-system component variants
 * (currently the Button/IconButton `buttonVariantClasses`) rather than a hand-maintained
 * map — so they stay in sync as the design system grows. Each variant's Tailwind class
 * list encodes which text/border token sits on which background token, per interaction
 * state. We parse those, resolve the live CSS-variable values, and score against WCAG.
 *
 * Variants whose background is transparent (ghost/outline/link) have no intrinsic
 * background — the element sits on whatever surface contains it — so their foreground
 * tokens are scored against the set of container surface tokens instead.
 */

/** Sources to derive pairs from. Add more component variant maps here as the DS grows. */
const CONTRAST_SOURCES: Record<string, readonly string[]>[] = [buttonVariantClasses];

// Tailwind state modifiers that change colour. focus-visible only sets a shadow → ignored.
const STATE_PREFIXES = ['hover:', 'active:', 'disabled:', 'aria-disabled:'] as const;

type Slot = 'bg' | 'text' | 'border';
interface ParsedClass {
    slot: Slot;
    /** token name without the utility prefix, e.g. "interactive-primary", "text-on-accent" */
    token: string;
    state: string;
}

function parseClass(raw: string): ParsedClass | null {
    let cls = raw;
    let state = 'base';
    for (const p of STATE_PREFIXES) {
        if (cls.startsWith(p)) {
            state = p.slice(0, -1);
            cls = cls.slice(p.length);
            break;
        }
    }
    // strip any leftover modifier we don't track (e.g. focus-visible:) — skip those classes
    if (cls.includes(':')) {
        return null;
    }
    const m = /^(bg|text|border)-(.+)$/.exec(cls);
    if (!m) {
        return null;
    }
    return { slot: m[1] as Slot, token: m[2], state };
}

export interface ContrastPair {
    /** foreground CSS var (e.g. "--text-on-accent") */
    fgVar: string;
    /** background CSS var (e.g. "--interactive-primary") */
    bgVar: string;
    /** text contrast (4.5/7 thresholds) vs UI/border contrast (3 threshold) */
    kind: 'text' | 'border';
}

/**
 * Derive the unique foreground→background token pairs encoded across all registered
 * design-system component variants, resolving per-state overrides against the base state.
 */
export function deriveContrastPairs(isKnownToken: (cssVar: string) => boolean): ContrastPair[] {
    const out = new Map<string, ContrastPair>();

    for (const source of CONTRAST_SOURCES) {
        for (const classes of Object.values(source)) {
            // Collect tokens per state for this variant
            const byState: Record<string, Partial<Record<Slot, string>>> = {};
            for (const entry of classes) {
                for (const raw of entry.split(/\s+/)) {
                    const parsed = parseClass(raw);
                    if (!parsed) continue;
                    const cssVar = `--${parsed.token}`;
                    if (!isKnownToken(cssVar)) continue; // skips transparent, font-size utils, etc.
                    (byState[parsed.state] ??= {})[parsed.slot] = parsed.token;
                }
            }
            const base = byState.base ?? {};
            // Emit a pair for each state, inheriting unset slots from base
            for (const state of ['base', 'hover', 'active', 'disabled']) {
                const s = byState[state];
                if (!s && state !== 'base') continue;
                const bg = s?.bg ?? base.bg;
                const fg = s?.text ?? base.text;
                const border = s?.border ?? base.border;
                if (bg && fg) {
                    const p: ContrastPair = { fgVar: `--${fg}`, bgVar: `--${bg}`, kind: 'text' };
                    out.set(`${p.fgVar}|${p.bgVar}|text`, p);
                }
                if (bg && border) {
                    const p: ContrastPair = { fgVar: `--${border}`, bgVar: `--${bg}`, kind: 'border' };
                    out.set(`${p.fgVar}|${p.bgVar}|border`, p);
                }
            }
        }
    }
    return [...out.values()];
}

// ── Colour math (WCAG 2.x) ──────────────────────────────────────────────────

interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
}

/** Parses #RGB / #RGBA / #RRGGBB / #RRGGBBAA. Returns null for non-hex (e.g. unresolved refs). */
export function parseHex(hex: string): Rgba | null {
    const h = hex.trim().replace(/^#/, '');
    let r: number,
        g: number,
        b: number,
        a = 255;
    if (h.length === 3 || h.length === 4) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
        if (h.length === 4) a = parseInt(h[3] + h[3], 16);
    } else if (h.length === 6 || h.length === 8) {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
        if (h.length === 8) a = parseInt(h.slice(6, 8), 16);
    } else {
        return null;
    }
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r, g, b, a: a / 255 };
}

/** Alpha-composite `fg` over opaque `bg`. */
function composite(fg: Rgba, bg: Rgba): Rgba {
    const a = fg.a;
    return {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
        a: 1
    };
}

function relativeLuminance({ r, g, b }: Rgba): number {
    const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1–21) between a foreground and an opaque background hex. */
export function contrastRatio(fgHex: string, bgHex: string): number | null {
    const fg = parseHex(fgHex);
    const bg = parseHex(bgHex);
    if (!fg || !bg) return null;
    const fgSolid = fg.a < 1 ? composite(fg, bg.a < 1 ? composite(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg) : fg;
    const bgSolid = bg.a < 1 ? composite(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
    const l1 = relativeLuminance(fgSolid);
    const l2 = relativeLuminance(bgSolid);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

export type Band = 'aaa' | 'aa' | 'aa-large' | 'fail';

/** WCAG band for normal text. (Large text / UI surfaces are "aa-large" at ≥3.) */
export function bandOf(ratio: number, kind: 'text' | 'border'): Band {
    // Borders / UI components only need 3:1 (WCAG 1.4.11)
    if (kind === 'border') return ratio >= 3 ? 'aa' : 'fail';
    if (ratio >= 7) return 'aaa';
    if (ratio >= 4.5) return 'aa';
    if (ratio >= 3) return 'aa-large';
    return 'fail';
}

export interface ContrastScore {
    bgVar: string;
    ratio: number;
    band: Band;
    kind: 'text' | 'border';
}

/** True when a resolved colour value is fully transparent (alpha 0). */
function isTransparent(hex: string): boolean {
    const c = parseHex(hex);
    return !!c && c.a === 0;
}

/**
 * Builds a map of foregroundCssVar → contrast scores. Transparent-background pairs are
 * expanded to score against each provided container surface.
 */
export function buildContrastIndex(opts: {
    resolve: (cssVar: string) => string;
    isKnownToken: (cssVar: string) => boolean;
    surfaces: string[];
}): Map<string, ContrastScore[]> {
    const { resolve, isKnownToken, surfaces } = opts;
    const index = new Map<string, ContrastScore[]>();
    const push = (fgVar: string, score: ContrastScore) => {
        const list = index.get(fgVar) ?? [];
        if (!list.some((s) => s.bgVar === score.bgVar)) list.push(score);
        index.set(fgVar, list);
    };

    for (const pair of deriveContrastPairs(isKnownToken)) {
        const fgVal = resolve(pair.fgVar);
        const bgVal = resolve(pair.bgVar);
        const targets = isTransparent(bgVal) ? surfaces : [pair.bgVar];
        for (const bgVar of targets) {
            const ratio = contrastRatio(fgVal, resolve(bgVar));
            if (ratio == null) continue;
            push(pair.fgVar, { bgVar, ratio, band: bandOf(ratio, pair.kind), kind: pair.kind });
        }
    }
    return index;
}
