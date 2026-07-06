/**
 * Contrast checking for the Token Editor.
 *
 * The checker's source of truth is a declarative TOKEN-INTENT table (`CONTRAST_INTENT`): for each
 * foreground token it records where that token is *intended* to sit — the container surfaces, an
 * accent fill, the inverse surface, or its own status surface — and which WCAG rule applies.
 *
 * Why intent rather than parsing component styles: the relationship "this token sits on that
 * background" is a stable property of the token vocabulary (~a few dozen tokens), not of any one
 * component. Keying on intent covers every usage — buttons, inputs, links in prose, alerts — with a
 * small table that only grows when a genuinely new token *family* is added, and it never silently
 * drifts the way per-component parsing (limited to components that expose their classes) or a
 * per-usage map (easy to forget to update) would.
 *
 * Resting state only, and decorative tokens are intentionally omitted (see the notes on the table):
 * disabled controls are WCAG-exempt, hover/active are transient, and purely decorative borders
 * (`--border-default`, `--border-muted`) and label-paired `--icon-*` are exempt under 1.4.11.
 */

/** 'surfaces' → the container surfaces passed to the checker; a list → explicit bg tokens; a fn → derive the bg(s) from the fg token. */
type Backgrounds = 'surfaces' | string[] | ((fgVar: string) => string[]);

interface IntentRule {
    /** foreground token(s) this rule scores — exact cssVar, a list, or a matcher */
    fg: string | string[] | RegExp;
    /** where those foregrounds are intended to sit */
    on: Backgrounds;
    kind: ContrastKind;
    /** what/why — keeps the table auditable */
    note: string;
}

/** A status family's own tinted surface: --status-X-{icon,text,strong} → --status-X-bg. */
const statusFamilyBg = (fgVar: string): string[] => {
    const m = /^--status-(.+)-(icon|text|strong)$/.exec(fgVar);
    return m ? [`--status-${m[1]}-bg`] : [];
};

/**
 * The declarative source of truth. Edit this table (not component code) to change what the checker
 * assesses. Tokens absent from every rule are intentionally unscored.
 */
const CONTRAST_INTENT: IntentRule[] = [
    // ── Text legibility (WCAG 1.4.3, 4.5:1 / 1.4.6 AAA 7:1) ──
    {
        fg: [
            '--text-default',
            '--text-secondary',
            '--text-strong',
            '--text-muted',
            '--text-link',
            '--text-brand',
            '--text-success',
            '--text-warning',
            '--text-danger',
            '--text-info'
        ],
        on: 'surfaces',
        kind: 'text',
        note: 'body / link / inline-semantic text on container surfaces'
    },
    {
        fg: '--text-on-accent',
        on: ['--interactive-primary', '--interactive-danger'],
        kind: 'text',
        note: 'label text on solid accent fills (primary/danger buttons)'
    },
    { fg: '--text-inverse', on: ['--surface-inverse'], kind: 'text', note: 'text on the inverse surface (secondary button, tooltip)' },
    { fg: /^--status-.+-(text|strong)$/, on: statusFamilyBg, kind: 'text', note: 'alert/badge text on its own tinted status surface' },

    // ── Non-text UI contrast (WCAG 1.4.11 / focus 2.4.11, 3:1) ──
    { fg: '--border-interactive', on: 'surfaces', kind: 'border', note: 'interactive control boundary (input / outline button) on surfaces' },
    {
        fg: ['--interactive-primary', '--interactive-danger', '--surface-inverse'],
        on: 'surfaces',
        kind: 'fill',
        note: 'solid component fill vs the surface behind it (control is only visible by its fill)'
    },
    { fg: ['--focus-ring-default', '--focus-ring-danger'], on: 'surfaces', kind: 'focus', note: 'focus ring vs the surface it is drawn on' },
    { fg: /^--status-.+-icon$/, on: statusFamilyBg, kind: 'icon', note: 'status badge icon vs its own tinted status surface' }

    // Intentionally NOT scored — decorative or WCAG-exempt:
    //   --border-default / --border-muted  (decorative card/divider borders, 1.4.11-exempt)
    //   general --icon-*                    (usually paired with a text label → decorative)
    //   --text-disabled / --icon-disabled   (disabled controls are exempt, 1.4.3/1.4.11)
    //   *-hover / *-active                  (transient states)
];

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

// ── Intent-table walking ─────────────────────────────────────────────────────

function matchesFg(fgVar: string, fg: IntentRule['fg']): boolean {
    if (typeof fg === 'string') return fg === fgVar;
    if (Array.isArray(fg)) return fg.includes(fgVar);
    return fg.test(fgVar);
}

/** Resolve a rule's `on` to concrete, known background tokens (never the fg itself). */
function resolveBackgrounds(fgVar: string, on: Backgrounds, surfaces: string[], isKnownToken: (cssVar: string) => boolean): string[] {
    const raw = on === 'surfaces' ? surfaces : typeof on === 'function' ? on(fgVar) : on;
    return raw.filter((bg) => bg !== fgVar && isKnownToken(bg));
}

/** Walk the intent table over the known token set, invoking `cb` for each foreground→background pair. */
function forEachIntentPair(
    allVars: string[],
    surfaces: string[],
    isKnownToken: (cssVar: string) => boolean,
    cb: (fgVar: string, bgVar: string, kind: ContrastKind) => void
): void {
    for (const fgVar of allVars) {
        if (!isKnownToken(fgVar)) continue;
        for (const rule of CONTRAST_INTENT) {
            if (!matchesFg(fgVar, rule.fg)) continue;
            for (const bgVar of resolveBackgrounds(fgVar, rule.on, surfaces, isKnownToken)) {
                cb(fgVar, bgVar, rule.kind);
            }
        }
    }
}

/**
 * The set of tokens that participate in any contrast check — STRUCTURAL (from the intent table +
 * token names, independent of resolved colour values). Used to decide which rows to show in contrast
 * mode; because it doesn't depend on values, a row never disappears mid-edit just because its colour
 * is temporarily invalid or stops producing a score.
 */
export function deriveContrastRelevantVars(opts: { isKnownToken: (cssVar: string) => boolean; surfaces: string[]; allVars: string[] }): Set<string> {
    const { isKnownToken, surfaces, allVars } = opts;
    const set = new Set<string>();
    forEachIntentPair(allVars, surfaces, isKnownToken, (fgVar, bgVar) => {
        set.add(fgVar);
        set.add(bgVar);
    });
    return set;
}

/**
 * Builds a map of foregroundCssVar → contrast scores by walking the intent table over the known
 * token set and resolving each pair's live colour values. `allVars` is all known semantic cssVars.
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

    forEachIntentPair(allVars, surfaces, isKnownToken, (fgVar, bgVar, kind) => {
        const ratio = contrastRatio(resolve(fgVar), resolve(bgVar));
        if (ratio == null) return;
        push(fgVar, { bgVar, ratio, band: bandOf(ratio, kind), kind });
    });
    return index;
}
