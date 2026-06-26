import { buttonVariantClasses } from '@nangohq/design-system';

/**
 * Contrast checking for the Token Editor.
 *
 * Foreground/background token pairs are DERIVED FROM design-system component variants
 * (currently the Button/IconButton `buttonVariantClasses`) rather than a hand-maintained
 * map — so they stay in sync as the design system grows. Each variant's Tailwind class
 * list encodes which text/border token sits on which background token.
 *
 * Only the RESTING state is scored: hover/active are transient, and disabled controls are
 * exempt from WCAG contrast (1.4.3). So any class carrying a state modifier (`hover:`,
 * `active:`, `disabled:`, `focus-visible:`, …) is ignored — we only read unprefixed classes.
 *
 * Variants whose background is transparent (ghost/outline/link) have no intrinsic
 * background — the element sits on whatever surface contains it — so their foreground
 * tokens are scored against the set of container surface tokens instead.
 *
 * Three things are scored: text legibility on the component (1.4.3), border vs the
 * component background (1.4.11), and — for solid-fill components — the fill itself vs the
 * surrounding surfaces (1.4.11 component identifiability: a button with a transparent border
 * is only distinguishable from the page by its fill, so that fill needs ≥3:1).
 */

/** Sources to derive pairs from. Add more component variant maps here as the DS grows. */
const CONTRAST_SOURCES: Record<string, readonly string[]>[] = [buttonVariantClasses];

type Slot = 'bg' | 'text' | 'border';
interface ParsedClass {
    slot: Slot;
    /** token name without the utility prefix, e.g. "interactive-primary", "text-on-accent" */
    token: string;
}

function parseClass(raw: string): ParsedClass | null {
    // Resting state only — skip any class with a state/variant modifier (hover:, disabled:, …)
    if (raw.includes(':')) {
        return null;
    }
    const m = /^(bg|text|border)-(.+)$/.exec(raw);
    if (!m) {
        return null;
    }
    return { slot: m[1] as Slot, token: m[2] };
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
 * Derive the unique foreground→background token pairs encoded in the resting state of all
 * registered design-system component variants.
 */
export function deriveContrastPairs(isKnownToken: (cssVar: string) => boolean): ContrastPair[] {
    const out = new Map<string, ContrastPair>();

    for (const source of CONTRAST_SOURCES) {
        for (const classes of Object.values(source)) {
            // Collect the resting-state bg/text/border tokens for this variant
            const slots: Partial<Record<Slot, string>> = {};
            for (const entry of classes) {
                for (const raw of entry.split(/\s+/)) {
                    const parsed = parseClass(raw);
                    if (!parsed) continue;
                    const cssVar = `--${parsed.token}`;
                    if (!isKnownToken(cssVar)) continue; // skips transparent, font-size utils, etc.
                    slots[parsed.slot] = parsed.token;
                }
            }
            const { bg, text: fg, border } = slots;
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
/**
 * 'text' → 1.4.3/1.4.6 text contrast (4.5/7). Everything else is UI-component contrast at 3:1:
 * 'border' (1.4.11), 'fill' (component vs surface, 1.4.11), 'focus' (focus ring, 2.4.11/1.4.11),
 * 'icon' (graphical objects, 1.4.11).
 */
export type ContrastKind = 'text' | 'border' | 'fill' | 'focus' | 'icon';

/** WCAG band for normal text. (Large text / UI surfaces are "aa-large" at ≥3.) */
export function bandOf(ratio: number, kind: ContrastKind): Band {
    // Only text uses the 4.5/7 thresholds; all non-text contrast (borders, fills, focus rings,
    // graphical objects) is held to 3:1 (WCAG 1.4.11 / 2.4.11).
    if (kind !== 'text') return ratio >= 3 ? 'aa' : 'fail';
    if (ratio >= 7) return 'aaa';
    if (ratio >= 4.5) return 'aa';
    if (ratio >= 3) return 'aa-large';
    return 'fail';
}

export interface ContrastScore {
    bgVar: string;
    ratio: number;
    band: Band;
    kind: ContrastKind;
}

/** True when a resolved colour value is fully transparent (alpha 0). */
function isTransparent(hex: string): boolean {
    const c = parseHex(hex);
    return !!c && c.a === 0;
}

/** Focus-ring colour tokens used by the registered variants (shadow-focus-outline-X → --focus-ring-X). */
function deriveFocusRingVars(isKnownToken: (cssVar: string) => boolean): Set<string> {
    const out = new Set<string>();
    for (const source of CONTRAST_SOURCES) {
        for (const classes of Object.values(source)) {
            for (const entry of classes) {
                for (const raw of entry.split(/\s+/)) {
                    const m = /(?:^|:)shadow-focus-outline-([a-z]+)/.exec(raw);
                    if (m && isKnownToken(`--focus-ring-${m[1]}`)) out.add(`--focus-ring-${m[1]}`);
                }
            }
        }
    }
    return out;
}

/** Status badge icon tokens paired with the status surface they sit on (--status-X-icon → --status-X-bg). */
function deriveStatusIconPairs(allVars: string[], isKnownToken: (cssVar: string) => boolean): { iconVar: string; bgVar: string }[] {
    const out: { iconVar: string; bgVar: string }[] = [];
    for (const iconVar of allVars) {
        const m = /^--status-(.+)-icon$/.exec(iconVar);
        if (!m) continue;
        const bgVar = `--status-${m[1]}-bg`;
        if (isKnownToken(bgVar)) out.push({ iconVar, bgVar });
    }
    return out;
}

/**
 * The set of tokens that participate in any contrast check — STRUCTURAL (derived from token names
 * and component variants, independent of resolved colour values). Used to decide which rows to show
 * in contrast mode. Because it doesn't depend on values, a row never disappears mid-edit just because
 * its colour is temporarily invalid or stops producing a score.
 */
export function deriveContrastRelevantVars(opts: { isKnownToken: (cssVar: string) => boolean; surfaces: string[]; allVars: string[] }): Set<string> {
    const { isKnownToken, surfaces, allVars } = opts;
    const set = new Set<string>(surfaces);
    for (const pair of deriveContrastPairs(isKnownToken)) {
        set.add(pair.fgVar);
        set.add(pair.bgVar);
    }
    for (const ringVar of deriveFocusRingVars(isKnownToken)) set.add(ringVar);
    for (const { iconVar, bgVar } of deriveStatusIconPairs(allVars, isKnownToken)) {
        set.add(iconVar);
        set.add(bgVar);
    }
    return set;
}

/**
 * Builds a map of foregroundCssVar → contrast scores. Transparent-background pairs are
 * expanded to score against each provided container surface. `allVars` (all known semantic
 * cssVars) is used to discover icon/graphical tokens by naming convention.
 */
export function buildContrastIndex(opts: {
    resolve: (cssVar: string) => string;
    isKnownToken: (cssVar: string) => boolean;
    surfaces: string[];
    allVars: string[];
}): Map<string, ContrastScore[]> {
    const { resolve, isKnownToken, surfaces, allVars } = opts;
    const index = new Map<string, ContrastScore[]>();
    const push = (fgVar: string, score: ContrastScore) => {
        const list = index.get(fgVar) ?? [];
        if (!list.some((s) => s.bgVar === score.bgVar)) list.push(score);
        index.set(fgVar, list);
    };

    const pairs = deriveContrastPairs(isKnownToken);

    // Text (1.4.3) and border (1.4.11) contrast: the variant's foreground against its background,
    // expanding transparent backgrounds to the surfaces the element can sit on.
    for (const pair of pairs) {
        const fgVal = resolve(pair.fgVar);
        const bgVal = resolve(pair.bgVar);
        const targets = isTransparent(bgVal) ? surfaces : [pair.bgVar];
        for (const bgVar of targets) {
            const ratio = contrastRatio(fgVal, resolve(bgVar));
            if (ratio == null) continue;
            push(pair.fgVar, { bgVar, ratio, band: bandOf(ratio, pair.kind), kind: pair.kind });
        }
    }

    // Component identifiability (1.4.11): a solid (opaque) component fill is its own boundary, so it
    // must contrast ≥3:1 with the surfaces behind it — otherwise you can't tell the control is there.
    // Transparent fills (ghost/outline) have no fill to distinguish; their boundary is text/border.
    const fillVars = new Set(pairs.map((p) => p.bgVar));
    for (const fillVar of fillVars) {
        const fill = parseHex(resolve(fillVar));
        if (!fill || fill.a < 1) continue;
        for (const surfaceVar of surfaces) {
            if (surfaceVar === fillVar) continue;
            const ratio = contrastRatio(resolve(fillVar), resolve(surfaceVar));
            if (ratio == null) continue;
            push(fillVar, { bgVar: surfaceVar, ratio, band: bandOf(ratio, 'fill'), kind: 'fill' });
        }
    }

    // Focus indicator (WCAG 2.4.11 / 1.4.11): the focus ring must contrast ≥3:1 with the surface
    // it's drawn on. The ring colour token is derived from each variant's focus-visible shadow utility.
    for (const ringVar of deriveFocusRingVars(isKnownToken)) {
        const ring = parseHex(resolve(ringVar));
        if (!ring || ring.a < 1) continue;
        for (const surfaceVar of surfaces) {
            const ratio = contrastRatio(resolve(ringVar), resolve(surfaceVar));
            if (ratio == null) continue;
            push(ringVar, { bgVar: surfaceVar, ratio, band: bandOf(ratio, 'focus'), kind: 'focus' });
        }
    }

    // Graphical objects (WCAG 1.4.11): status badge icons must contrast ≥3:1 with the status surface
    // they sit on. The general --icon-* family is intentionally not scored: most of those icons are
    // paired with a text label, which makes them decorative and 1.4.11-exempt, and the tool can't tell
    // a sole-indicator icon from a decorative one.
    for (const { iconVar, bgVar } of deriveStatusIconPairs(allVars, isKnownToken)) {
        const ratio = contrastRatio(resolve(iconVar), resolve(bgVar));
        if (ratio == null) continue;
        push(iconVar, { bgVar, ratio, band: bandOf(ratio, 'icon'), kind: 'icon' });
    }
    return index;
}
