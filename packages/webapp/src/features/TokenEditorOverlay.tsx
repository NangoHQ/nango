import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronUp, Download, Link2, ListFilter, Moon, RotateCcw, Sun, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { darkModeSelector, useThemeStore } from '@/lib/theme';

import rawTokensStr from '../../../design-system/tokens/tokens.json?raw';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

// Raw import avoids TypeScript OOM on the 3k-line JSON (same technique as design-system/tokens/types.ts)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — relative escape from webapp into design-system is intentional for this dev-only tool

// --- Types ---

interface TokenLeaf {
    $value: string | Record<string, string>;
    $type: string;
}
interface TokenGroup {
    [key: string]: TokenNode;
}
type TokenNode = TokenLeaf | TokenGroup;
interface RawTokens {
    'Semantic/Light': TokenGroup;
    'Semantic/Dark': TokenGroup;
    Primitives: { color: TokenGroup; [k: string]: TokenNode };
}
interface TokenEntry {
    cssVar: string;
    category: string;
    baseHex: string;
    /** The direct $value ref from the JSON — used as the export path */
    primitiveRef?: string;
    /** The ultimate primitive ref to display in the column (may differ from primitiveRef) */
    displayRef?: string;
    /** Tooltip text describing how displayRef was reached */
    displayTooltip?: string;
    path: string[];
    mode: 'semantic' | 'primitive';
}

// --- Token parsing ---

function isLeaf(node: TokenNode): node is TokenLeaf {
    return '$value' in node;
}

function toKebab(s: string): string {
    return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

const rawTokens = JSON.parse(rawTokensStr) as RawTokens;

function walkColor(group: TokenGroup, path: string[], cb: (path: string[], leaf: TokenLeaf) => void) {
    for (const [key, node] of Object.entries(group)) {
        if (key.startsWith('$')) continue;
        if (isLeaf(node)) {
            if (node.$type === 'color') cb([...path, key], node);
        } else {
            walkColor(node, [...path, key], cb);
        }
    }
}

function resolveRef(ref: string, depth = 0): string {
    if (depth > 8) return ref; // guard against circular refs
    const parts = ref.slice(1, -1).split('.');
    let node: unknown = rawTokens.Primitives;
    for (const p of parts) {
        if (!node || typeof node !== 'object') return ref;
        node = (node as Record<string, unknown>)[p];
    }
    if (node && typeof node === 'object' && '$value' in node && typeof (node as TokenLeaf).$value === 'string') {
        const val = (node as TokenLeaf).$value as string;
        // Primitive aliases point to other refs (e.g. info → brand) — follow the chain
        return val.startsWith('{') ? resolveRef(val, depth + 1) : val;
    }
    return ref;
}

function lookupNode(group: TokenGroup, parts: string[]): TokenLeaf | null {
    let node: unknown = group;
    for (const p of parts) {
        if (!node || typeof node !== 'object') return null;
        node = (node as Record<string, unknown>)[p];
    }
    return node && typeof node === 'object' && '$value' in node ? (node as TokenLeaf) : null;
}

/**
 * Given a direct ref from a semantic token, returns { displayRef, tooltip } when the
 * column should show a different (more resolved) ref and/or explain the chain.
 * - Primitive alias (info → brand): show info/800, tooltip "aliases brand/800"
 * - Cross-semantic hop (state.hover → color.alpha.black.6): show alpha/black/6, tooltip "via state/hover"
 * Returns null when the ref is a direct primitive with no extra hops.
 */
function resolveDisplayRef(ref: string): { displayRef: string; tooltip: string } | null {
    const parts = ref.slice(1, -1).split('.');

    // Case 1: direct primitive ref — check if it's an alias within Primitives
    const primLeaf = lookupNode(rawTokens.Primitives as unknown as TokenGroup, parts);
    if (primLeaf && typeof primLeaf.$value === 'string') {
        if (primLeaf.$value.startsWith('{')) {
            // Primitive alias (e.g. {color.info.800} → {color.brand.800})
            const aliasShort = primLeaf.$value.slice(1, -1).split('.').slice(1).join('/');
            return { displayRef: ref, tooltip: `→ ${aliasShort}` };
        }
        return null; // direct primitive, nothing extra to show
    }

    // Case 2: cross-semantic ref — look up in Semantic/Light to find the actual primitive
    const semLeaf = lookupNode(rawTokens['Semantic/Light'] as unknown as TokenGroup, parts);
    if (semLeaf && typeof semLeaf.$value === 'string' && semLeaf.$value.startsWith('{')) {
        const ultimateHex = resolveRef(semLeaf.$value);
        if (ultimateHex.startsWith('#')) {
            const viaCssVar = '--' + parts.map(toKebab).join('-');
            const ultimateShort = semLeaf.$value.slice(1, -1).split('.').slice(1).join('/');
            return { displayRef: semLeaf.$value, tooltip: `→ ${viaCssVar} → ${ultimateShort}` };
        }
    }

    return null;
}

type SemKey = 'Semantic/Light' | 'Semantic/Dark';

function buildEntries(mode: 'semantic' | 'primitive', semKey: SemKey = 'Semantic/Light'): TokenEntry[] {
    const result: TokenEntry[] = [];
    if (mode === 'semantic') {
        walkColor(rawTokens[semKey], [], (path, leaf) => {
            const cssVar = '--' + path.map(toKebab).join('-');
            let baseHex = typeof leaf.$value === 'string' ? leaf.$value : '#000000';
            let primitiveRef: string | undefined;
            let displayRef: string | undefined;
            let displayTooltip: string | undefined;
            if (typeof leaf.$value === 'string' && leaf.$value.startsWith('{')) {
                primitiveRef = leaf.$value;
                const resolved = resolveDisplayRef(leaf.$value);
                displayRef = resolved?.displayRef;
                displayTooltip = resolved?.tooltip;
                // For cross-semantic hops the baseHex must be re-resolved via Semantic/Light
                baseHex = resolved && resolved.displayRef !== leaf.$value
                    ? resolveRef(resolved.displayRef)
                    : resolveRef(leaf.$value);
            }
            result.push({ cssVar, category: path[0] ?? 'other', baseHex, primitiveRef, displayRef, displayTooltip, path, mode });
        });
    } else {
        walkColor(rawTokens.Primitives.color, ['color'], (path, leaf) => {
            const cssVar = '--ds-' + path.map(toKebab).join('-');
            let baseHex = typeof leaf.$value === 'string' ? leaf.$value : '#000000';
            let primitiveRef: string | undefined;
            let displayRef: string | undefined;
            let displayTooltip: string | undefined;
            // Detect alias primitives (e.g. info/600 → brand/600)
            if (typeof leaf.$value === 'string' && leaf.$value.startsWith('{')) {
                primitiveRef = leaf.$value;
                baseHex = resolveRef(leaf.$value);
                const resolved = resolveDisplayRef(leaf.$value);
                displayRef = resolved?.displayRef;
                displayTooltip = resolved?.tooltip;
            }
            result.push({ cssVar, category: path[1] ?? path[0] ?? 'other', baseHex, primitiveRef, displayRef, displayTooltip, path, mode });
        });
    }
    return result;
}

const SEMANTIC_ENTRIES = buildEntries('semantic', 'Semantic/Light');
const DARK_SEMANTIC_ENTRIES = buildEntries('semantic', 'Semantic/Dark');
const PRIMITIVE_ENTRIES = buildEntries('primitive');
const ALL_ENTRIES = [...SEMANTIC_ENTRIES, ...PRIMITIVE_ENTRIES];
const ENTRIES_BY_VAR = new Map(ALL_ENTRIES.map((e) => [e.cssVar, e]));
const DARK_ENTRIES_BY_VAR = new Map([...DARK_SEMANTIC_ENTRIES, ...PRIMITIVE_ENTRIES].map((e) => [e.cssVar, e]));
/** True when a semantic entry matches a specific primitive ref filter (incl. alias chains). */
function semanticMatchesRef(entry: TokenEntry, filterRef: string): boolean {
    if (!entry.primitiveRef) return false;
    if (entry.primitiveRef === filterRef) return true;
    if (entry.displayRef === filterRef) return true;
    return collectPrimitiveAliasRefs(entry.primitiveRef).includes(filterRef);
}

/** True when a semantic entry's primitive source belongs to the given category (incl. alias chains). */
function semanticMatchesCategory(entry: TokenEntry, category: string): boolean {
    const categoryRefs = new Set(PRIMITIVE_ENTRIES.filter((e) => e.category === category).map(entryToRef));
    if (!entry.primitiveRef) return false;
    if (categoryRefs.has(entry.primitiveRef)) return true;
    if (entry.displayRef && categoryRefs.has(entry.displayRef)) return true;
    return collectPrimitiveAliasRefs(entry.primitiveRef).some((r) => categoryRefs.has(r));
}

/** True when a primitive entry has a direct hex value (not an alias forwarding to another primitive). */
function isPrimitiveLeaf(entry: TokenEntry): boolean {
    if (entry.mode !== 'primitive') return false;
    const leaf = lookupNode(rawTokens.Primitives as unknown as TokenGroup, entry.path);
    return !!leaf && typeof leaf.$value === 'string' && !leaf.$value.startsWith('{');
}

/** Collects all alias-target refs within Primitives (e.g. {color.info.600} → ['{color.brand.600}']). */
function collectPrimitiveAliasRefs(ref: string): string[] {
    const refs: string[] = [];
    let current = ref;
    for (let i = 0; i < 8; i++) {
        const parts = current.slice(1, -1).split('.');
        const leaf = lookupNode(rawTokens.Primitives as unknown as TokenGroup, parts);
        if (!leaf || typeof leaf.$value !== 'string' || !leaf.$value.startsWith('{')) break;
        current = leaf.$value;
        refs.push(current);
    }
    return refs;
}

/**
 * Returns ALL extra CSS vars that should be set/cleared when a linked semantic override
 * propagates recursively through the token system:
 *   1. The direct primitive CSS var (--ds-color-info-600)
 *   2. Each alias target in the Primitives chain (--ds-color-brand-600)
 *   3. All OTHER semantic tokens referencing any primitive in that chain (--icon-brand, etc.)
 *   4. For cross-semantic hops: the intermediate semantic CSS var first (--state-pressed)
 */
function getChainVars(entry: TokenEntry | null | undefined, linked: boolean, semEntries: TokenEntry[] = SEMANTIC_ENTRIES): string[] {
    if (!entry || !linked || !entry.primitiveRef || !entry.baseHex.startsWith('#')) return [];

    const primRefs = new Set<string>(); // all primitive refs touched by this chain
    const vars: string[] = [];

    if (entry.mode === 'semantic' && entry.displayRef && entry.displayRef !== entry.primitiveRef) {
        // Cross-semantic chain: first apply intermediate semantic var
        vars.push('--' + entry.primitiveRef.slice(1, -1).split('.').map(toKebab).join('-'));
        // Then the ultimate primitive and any further aliases
        primRefs.add(entry.displayRef);
        vars.push('--ds-' + entry.displayRef.slice(1, -1).split('.').map(toKebab).join('-'));
        for (const r of collectPrimitiveAliasRefs(entry.displayRef)) {
            primRefs.add(r);
            vars.push('--ds-' + r.slice(1, -1).split('.').map(toKebab).join('-'));
        }
    } else {
        // Direct primitive ref (possibly an alias): include the direct var and all alias targets
        primRefs.add(entry.primitiveRef);
        vars.push('--ds-' + entry.primitiveRef.slice(1, -1).split('.').map(toKebab).join('-'));
        for (const r of collectPrimitiveAliasRefs(entry.primitiveRef)) {
            primRefs.add(r);
            vars.push('--ds-' + r.slice(1, -1).split('.').map(toKebab).join('-'));
        }
    }

    // Cascade to every other semantic token that references any primitive in the chain
    for (const semEntry of semEntries) {
        if (semEntry.cssVar === entry.cssVar) continue;
        const ref = semEntry.primitiveRef;
        if (ref && (primRefs.has(ref) || (semEntry.displayRef && primRefs.has(semEntry.displayRef)))) {
            vars.push(semEntry.cssVar);
        }
    }

    return [...new Set(vars)];
}

// --- Persistence ---

type ThemeKey = 'light' | 'dark';
interface BiThemeOverrides { light: Record<string, string>; dark: Record<string, string> }
const EMPTY_BI: BiThemeOverrides = { light: {}, dark: {} };

const STORAGE_KEY = 'nango-dev-token-overrides';

function loadOverrides(): BiThemeOverrides {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        // Migrate old flat format (pre per-theme)
        if (typeof raw === 'object' && ('light' in raw || 'dark' in raw)) return raw as BiThemeOverrides;
        return { light: raw as Record<string, string>, dark: {} };
    } catch {
        return { ...EMPTY_BI };
    }
}

function saveOverrides(o: BiThemeOverrides) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
    } catch {
        /* ignore storage errors */
    }
}

function applyThemeOverrides(overrides: BiThemeOverrides, theme: ThemeKey) {
    for (const [k, v] of Object.entries(overrides[theme])) {
        document.documentElement.style.setProperty(k, v);
    }
}

// --- Export ---

interface ExportTree {
    $type?: string;
    $value?: string;
    [k: string]: ExportTree | string | undefined;
}

function buildExport(overridesPerTheme: BiThemeOverrides, linkedVars: Set<string>, refOverridesPerTheme: BiThemeOverrides): string {
    const out: Record<string, ExportTree> = {};

    function setPath(group: string, path: string[], val: string) {
        if (!out[group]) out[group] = {};
        let node: ExportTree = out[group];
        for (const seg of path.slice(0, -1)) {
            if (!node[seg]) node[seg] = {};
            node = node[seg] as ExportTree;
        }
        const lastKey = path[path.length - 1];
        if (lastKey) node[lastKey] = { $type: 'color', $value: val };
    }

    // Per-theme color overrides (ref reroutes handled inline per theme)
    for (const themeKey of ['light', 'dark'] as ThemeKey[]) {
        const themeOverrides = overridesPerTheme[themeKey];
        const themeRefOverrides = refOverridesPerTheme[themeKey];
        const semEntries = themeKey === 'dark' ? DARK_SEMANTIC_ENTRIES : SEMANTIC_ENTRIES;
        const semGroup = themeKey === 'dark' ? 'Semantic/Dark' : 'Semantic/Light';

        // Ref reroutes for this theme
        for (const [cssVar, newRef] of Object.entries(themeRefOverrides)) {
            const entry = ENTRIES_BY_VAR.get(cssVar);
            if (!entry || entry.mode !== 'semantic') continue;
            setPath(semGroup, entry.path, newRef);
        }

        for (const entry of [...semEntries, ...PRIMITIVE_ENTRIES]) {
            if (themeRefOverrides[entry.cssVar]) continue;
            const val = themeOverrides[entry.cssVar];
            if (!val) continue;

            if (entry.mode === 'semantic' && entry.primitiveRef && entry.baseHex.startsWith('#') && linkedVars.has(entry.cssVar)) {
                const ultimateRef = entry.displayRef && entry.displayRef !== entry.primitiveRef ? entry.displayRef : entry.primitiveRef;
                const leafRef = collectPrimitiveAliasRefs(ultimateRef).at(-1) ?? ultimateRef;
                if (entry.displayRef && entry.displayRef !== entry.primitiveRef) {
                    setPath(semGroup, entry.primitiveRef.slice(1, -1).split('.'), val);
                }
                setPath('Primitives', leafRef.slice(1, -1).split('.'), val);
            } else if (entry.mode === 'primitive' && entry.primitiveRef) {
                const leafRef = collectPrimitiveAliasRefs(entry.primitiveRef).at(-1) ?? entry.primitiveRef;
                setPath('Primitives', leafRef.slice(1, -1).split('.'), val);
            } else {
                setPath(entry.mode === 'primitive' ? 'Primitives' : semGroup, entry.path, val);
            }
        }
    }
    return JSON.stringify(out, null, 2);
}

/** Display label for a {group.path} ref: strips 'color/' for primitives, keeps full path for semantics. */
function shortRefLabel(ref: string): string {
    const parts = ref.slice(1, -1).split('.');
    return (parts[0] === 'color' ? parts.slice(1) : parts).join('/');
}

/** Returns a {group.path} ref from a TokenEntry for use in the picker. */
function entryToRef(entry: TokenEntry): string {
    return '{' + entry.path.join('.') + '}';
}

// --- Shared token picker popover content ---

interface TokenPickerContentProps {
    currentValue: string;
    excludeCssVar?: string;
    primitiveOnly?: boolean;
    onSelect: (ref: string) => void;
}

function TokenPickerContent({ currentValue, excludeCssVar, primitiveOnly, onSelect }: TokenPickerContentProps) {
    const [search, setSearch] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);
    const q = search.toLowerCase();

    const filteredPrimitives = useMemo(
        () => PRIMITIVE_ENTRIES.filter((e) => e.cssVar !== excludeCssVar && (e.cssVar.includes(q) || shortRefLabel(entryToRef(e)).includes(q))),
        [q, excludeCssVar]
    );
    const filteredSemantics = useMemo(
        () => primitiveOnly ? [] : SEMANTIC_ENTRIES.filter((e) => e.cssVar !== excludeCssVar && (e.cssVar.includes(q) || shortRefLabel(entryToRef(e)).includes(q))),
        [q, excludeCssVar, primitiveOnly]
    );

    return (
        <PopoverContent
            side="bottom"
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => { e.preventDefault(); searchRef.current?.focus(); }}
            onCloseAutoFocus={() => setSearch('')}
            className="flex w-96 flex-col gap-0 rounded border border-border-muted bg-surface-panel p-0 shadow-lg"
        >
            <div className="border-b border-border-muted p-1.5">
                <Input ref={searchRef} type="search" placeholder="Search tokens…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 font-mono text-xs" />
            </div>
            <div className="max-h-64 overflow-y-auto">
                {filteredPrimitives.length > 0 && (
                    <>
                        <p className="sticky top-0 bg-surface-panel-muted px-3 py-1 text-xs font-medium uppercase tracking-wider text-text-muted">Primitives</p>
                        {filteredPrimitives.map((e) => {
                            const ref = entryToRef(e);
                            const hex = getComputedStyle(document.documentElement).getPropertyValue(e.cssVar).trim() || e.baseHex;
                            return (
                                <button key={e.cssVar} onClick={() => onSelect(ref)} className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs font-mono hover:bg-surface-page ${currentValue === ref ? 'text-text-default' : 'text-text-muted'}`}>
                                    <div className="size-3 shrink-0 rounded-sm border border-border-muted" style={{ backgroundColor: hex }} />
                                    <span className="min-w-0 truncate">{shortRefLabel(ref)}</span>
                                </button>
                            );
                        })}
                    </>
                )}
                {filteredSemantics.length > 0 && (
                    <>
                        <p className="sticky top-0 bg-surface-panel-muted px-3 py-1 text-xs font-medium uppercase tracking-wider text-text-muted">Semantic</p>
                        {filteredSemantics.map((e) => {
                            const ref = entryToRef(e);
                            const hex = getComputedStyle(document.documentElement).getPropertyValue(e.cssVar).trim() || e.baseHex;
                            return (
                                <button key={e.cssVar} onClick={() => onSelect(ref)} className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs font-mono hover:bg-surface-page ${currentValue === ref ? 'text-text-default' : 'text-text-muted'}`}>
                                    <div className="size-3 shrink-0 rounded-sm border border-border-muted" style={{ backgroundColor: hex }} />
                                    <span className="min-w-0 truncate">{e.cssVar}</span>
                                </button>
                            );
                        })}
                    </>
                )}
                {filteredPrimitives.length === 0 && filteredSemantics.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-text-muted">No tokens match</p>
                )}
            </div>
        </PopoverContent>
    );
}

// --- FilterPicker: replaces the category Select ---

function FilterPicker({ value, onChange }: { value: string | null; onChange: (ref: string | null) => void }) {
    const [open, setOpen] = useState(false);
    const label = value ? shortRefLabel(value) : null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            {value ? (
                /* Active: outline pill — left opens picker, right clears */
                <div className="flex h-8 shrink-0 items-stretch overflow-hidden rounded border border-border-strong text-text-default">
                    <PopoverTrigger asChild>
                        <button className="flex items-center gap-1 px-2 hover:bg-surface-page">
                            <ListFilter className="size-3.5 shrink-0" />
                            <span className="max-w-24 truncate font-mono text-xs">{label}</span>
                        </button>
                    </PopoverTrigger>
                    <div className="w-px bg-border-strong" />
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <button onClick={() => onChange(null)} className="flex items-center px-1.5 text-text-muted hover:bg-surface-page hover:text-text-default">
                                <X className="size-3" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Clear filter</TooltipContent>
                    </Tooltip>
                </div>
            ) : (
                /* Inactive: ghost icon button */
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1">
                                <ListFilter className="size-3.5" />
                            </Button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top">Filter by source token</TooltipContent>
                </Tooltip>
            )}
            <TokenPickerContent
                currentValue={value ?? ''}
                primitiveOnly
                onSelect={(ref) => {
                    onChange(value === ref ? null : ref);
                    setOpen(false);
                }}
            />
        </Popover>
    );
}

// --- RefPicker ---

interface RefPickerProps {
    entry: TokenEntry;
    currentRef: string;
    chainTooltip?: string;
    onPickRef: (cssVar: string, newRef: string) => void;
    onFilter?: (ref: string) => void;
    onJump?: (ref: string) => void;
}

function RefPicker({ entry, currentRef, chainTooltip, onPickRef, onFilter, onJump }: RefPickerProps) {
    const [open, setOpen] = useState(false);
    const label = shortRefLabel(currentRef);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <div className="group/ref flex w-36 shrink-0 items-center font-mono text-text-muted">
                {/* Picker trigger: [label▾] with hover background */}
                <PopoverTrigger asChild>
                    <button className="flex min-w-0 flex-1 cursor-pointer items-center justify-between rounded px-1 py-0.5 hover:bg-surface-page hover:text-text-default">
                        {chainTooltip ? (
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <span className="min-w-0 truncate underline decoration-dotted underline-offset-2">{label}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top">{chainTooltip}</TooltipContent>
                            </Tooltip>
                        ) : (
                            <span className="min-w-0 truncate">{label}</span>
                        )}
                        <ChevronDown className="size-3 shrink-0 opacity-0 group-hover/ref:opacity-100" />
                    </button>
                </PopoverTrigger>
                {/* Filter icon — hover only */}
                {onFilter && (
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <button onClick={() => onFilter(currentRef)} className="shrink-0 p-0.5 opacity-0 hover:text-text-default group-hover/ref:opacity-100">
                                <ListFilter className="size-3" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Filter by this source</TooltipContent>
                    </Tooltip>
                )}
                {/* Jump icon — hover only */}
                {onJump && (
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <button onClick={() => onJump(currentRef)} className="shrink-0 p-0.5 opacity-0 hover:text-text-default group-hover/ref:opacity-100">
                                <ArrowUpRight className="size-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">View in primitives</TooltipContent>
                    </Tooltip>
                )}
            </div>
            <TokenPickerContent
                currentValue={currentRef}
                excludeCssVar={entry.cssVar}
                onSelect={(ref) => { onPickRef(entry.cssVar, ref); setOpen(false); }}
            />
        </Popover>
    );
}

// --- TokenRow ---

interface RowProps {
    entry: TokenEntry;
    override: string | undefined;
    refOverride: string | undefined;
    linked: boolean;
    themeSeq: number;
    onCommit: (cssVar: string, val: string) => void;
    onReset: (cssVar: string) => void;
    onToggleLink: (cssVar: string) => void;
    onPickRef: (cssVar: string, newRef: string) => void;
    onFilterByRef: (ref: string) => void;
    onJumpToPrimitive: (ref: string) => void;
    showRef: boolean;
}

// True when the entry has a resolvable primitive ref — covers both semantic tokens and primitive aliases
function hasPrimitiveLink(entry: TokenEntry): boolean {
    return !!entry.primitiveRef && entry.baseHex.startsWith('#');
}

function TokenRow({ entry, override, refOverride, linked, themeSeq: _themeSeq, onCommit, onReset, onToggleLink, onPickRef, onFilterByRef, onJumpToPrimitive, showRef }: RowProps) {
    // Prefer the live CSS variable value over the JSON-derived baseHex, since some
    // semantic tokens reference other semantic tokens (e.g. {state.hover}) whose
    // resolved hex is only available in the computed style.
    const liveDefault = getComputedStyle(document.documentElement).getPropertyValue(entry.cssVar).trim() || entry.baseHex;
    const current = override ?? liveDefault;
    const [hex, setHex] = useState(current);
    const isModified = !!override || !!refOverride;
    const canLink = showRef && hasPrimitiveLink(entry);
    const isUnlinked = canLink && !linked;

    // Sync when override changes externally (reset, picker, initial load)
    useEffect(() => {
        setHex(current);
    }, [current]);

    // Native color picker only accepts 6-char hex
    const pickerVal = current.startsWith('#') && current.length >= 7 ? current.slice(0, 7) : '#000000';

    // Column shows the ref override, then display ref, then primitiveRef
    const colRef = refOverride ?? entry.displayRef ?? entry.primitiveRef;

    function handleHex(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value;
        setHex(v);
        if (/^#[0-9a-fA-F]{6,8}$/.test(v)) onCommit(entry.cssVar, v);
    }

    return (
        <div data-cssvar={entry.cssVar} className={`group flex items-center gap-2 pl-4 pr-2 py-1 text-[11px] ${isModified ? 'bg-status-info-bg' : ''}`}>
            {/* CSS var name */}
            <span className={`min-w-0 flex-1 truncate font-mono ${isModified ? 'text-text-default' : 'text-text-muted'}`}>{entry.cssVar}</span>

            {/* Primitive / source ref column */}
            {showRef && (
                colRef && entry.mode === 'semantic' ? (
                    <RefPicker
                        entry={entry}
                        currentRef={colRef}
                        chainTooltip={refOverride ? undefined : entry.displayTooltip}
                        onPickRef={onPickRef}
                        onFilter={onFilterByRef}
                        onJump={onJumpToPrimitive}
                    />
                ) : colRef ? (
                    <button
                        onClick={() => onFilterByRef(colRef)}
                        className="w-36 shrink-0 truncate text-left font-mono text-text-muted hover:text-text-default"
                        title="Filter by this primitive"
                    >
                        {shortRefLabel(colRef)}
                    </button>
                ) : (
                    <span className="w-36 shrink-0" />
                )
            )}

            {/* Swatch, hex input, and action buttons share a hover group so link icon is scoped */}
            <div className="group/picker flex shrink-0 items-center gap-1">
                <label className="relative cursor-pointer">
                    <div className="size-4 rounded-sm border border-border-muted" style={{ backgroundColor: current }} />
                    <input
                        type="color"
                        value={pickerVal}
                        onChange={(e) => onCommit(entry.cssVar, e.target.value)}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                </label>
                <input
                    type="text"
                    value={hex}
                    onChange={handleHex}
                    className="w-24 rounded border border-border-muted bg-surface-input px-1.5 py-0.5 font-mono text-text-default focus:outline-none focus:ring-1 focus:ring-border-selected"
                    placeholder="#000000"
                    spellCheck={false}
                />
                {/* Link toggle + reset inside the picker group */}
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => onToggleLink(entry.cssVar)}
                            className={`size-5 shrink-0 rounded p-1 transition-colors hover:text-text-default ${
                                !canLink
                                    ? 'invisible'
                                    : !isUnlinked
                                      ? 'text-text-muted'
                                      : 'text-transparent group-hover/picker:text-text-muted'
                            }`}
                        >
                            <Link2 className="size-3.5" />
                        </button>
                    </TooltipTrigger>
                    {canLink && (
                        <TooltipContent side="top">{linked ? 'Synced with source token' : 'Sync with source token'}</TooltipContent>
                    )}
                </Tooltip>
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onReset(entry.cssVar)}
                            className={`size-5 shrink-0 text-text-muted hover:text-text-default ${isModified ? '' : 'invisible'}`}
                        >
                            <RotateCcw className="size-3.5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Reset to default</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}

// --- Token editor content (rendered inside the Dev Tools drawer) ---

export function TokenEditorContent({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
    const [mode, setMode] = useState<'semantic' | 'primitive'>('semantic');
    const darkMode = useThemeStore(darkModeSelector);
    const toggleDarkMode = useThemeStore((s) => s.toggleDarkMode);
    // Bumped via rAF after applyTheme() has updated the CSS variables, so rows re-read live values
    const [themeSeq, setThemeSeq] = useState(0);
    useEffect(() => {
        const id = requestAnimationFrame(() => setThemeSeq((n) => n + 1));
        return () => cancelAnimationFrame(id);
    }, [darkMode]);
    // null = all | 'neutral' = category | '{color.neutral.800}' = exact ref
    const [primitiveFilter, setPrimitiveFilter] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [scrollTarget, setScrollTarget] = useState<string | null>(null);
    // Per-theme color overrides: changes in light mode are separate from dark mode changes
    const [overridesPerTheme, setOverridesPerTheme] = useState<BiThemeOverrides>({ ...EMPTY_BI });
    // Per-theme ref reroutes (which primitive a semantic token points to, per theme)
    const [refOverridesPerTheme, setRefOverridesPerTheme] = useState<BiThemeOverrides>({ ...EMPTY_BI });
    // Captures the live CSS value at the moment a token was first overridden (per theme, for diff "from")
    const [originalsPerTheme, setOriginalsPerTheme] = useState<BiThemeOverrides>({ ...EMPTY_BI });
    // CSS vars explicitly unlinked from their primitive — shared across themes
    const [linkedVars, setLinkedVars] = useState<Set<string>>(new Set());
    const [showDiff, setShowDiff] = useState(false);
    const [search, setSearch] = useState('');

    // Stable refs for use in effects that must not re-run on every override change
    const overridesRef = useRef(overridesPerTheme);
    overridesRef.current = overridesPerTheme;
    const linkedVarsRef = useRef(linkedVars);
    linkedVarsRef.current = linkedVars;

    // Load persisted overrides on mount and apply the current theme's set
    useEffect(() => {
        const saved = loadOverrides();
        setOverridesPerTheme(saved);
        applyThemeOverrides(saved, darkMode ? 'dark' : 'light');
        const id = requestAnimationFrame(() => setThemeSeq((n) => n + 1));
        return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Swap DOM overrides when theme changes: remove outgoing theme's, apply incoming theme's
    useEffect(() => {
        const o = overridesRef.current;
        const u = linkedVarsRef.current;
        const incoming: ThemeKey = darkMode ? 'dark' : 'light';
        const outgoing: ThemeKey = darkMode ? 'light' : 'dark';
        const outMap = outgoing === 'dark' ? DARK_ENTRIES_BY_VAR : ENTRIES_BY_VAR;
        const outSem = outgoing === 'dark' ? DARK_SEMANTIC_ENTRIES : SEMANTIC_ENTRIES;
        const inMap = incoming === 'dark' ? DARK_ENTRIES_BY_VAR : ENTRIES_BY_VAR;
        const inSem = incoming === 'dark' ? DARK_SEMANTIC_ENTRIES : SEMANTIC_ENTRIES;
        for (const cssVar of Object.keys(o[outgoing])) {
            document.documentElement.style.removeProperty(cssVar);
            const entry = outMap.get(cssVar);
            for (const v of getChainVars(entry, u.has(cssVar), outSem)) document.documentElement.style.removeProperty(v);
        }
        for (const [cssVar, val] of Object.entries(o[incoming])) {
            document.documentElement.style.setProperty(cssVar, val);
            const entry = inMap.get(cssVar);
            for (const v of getChainVars(entry, u.has(cssVar), inSem)) document.documentElement.style.setProperty(v, val);
        }
        const id = requestAnimationFrame(() => setThemeSeq((n) => n + 1));
        return () => cancelAnimationFrame(id);
    }, [darkMode]);

    // Derived: active theme's overrides/refs (for row rendering)
    const currentTheme: ThemeKey = darkMode ? 'dark' : 'light';
    const activeOverrides = overridesPerTheme[currentTheme];
    const activeRefOverrides = refOverridesPerTheme[currentTheme];

    // Scroll to target token after mode switch re-renders the list
    useEffect(() => {
        if (!scrollTarget || !listRef.current) return;
        const el = listRef.current.querySelector(`[data-cssvar="${scrollTarget}"]`);
        if (el) {
            el.scrollIntoView({ block: 'nearest' });
            setScrollTarget(null);
        }
    }, [scrollTarget, mode]);

    // Clear primitive filter when switching to primitive mode
    useEffect(() => {
        if (mode === 'primitive') setPrimitiveFilter(null);
    }, [mode]);

    const entries = mode === 'semantic'
        ? (darkMode ? DARK_SEMANTIC_ENTRIES : SEMANTIC_ENTRIES)
        : PRIMITIVE_ENTRIES;

    const filtered = useMemo(() => {
        let result = entries;
        if (search) {
            const q = search.toLowerCase();
            result = result.filter((e) => e.cssVar.includes(q) || e.category.includes(q));
        }
        if (primitiveFilter && mode === 'semantic') {
            result = result.filter((e) =>
                primitiveFilter.startsWith('{')
                    ? semanticMatchesRef(e, primitiveFilter)
                    : semanticMatchesCategory(e, primitiveFilter)
            );
        }
        return result;
    }, [entries, search, primitiveFilter, mode]);

    const grouped = useMemo(() => {
        const g: Record<string, TokenEntry[]> = {};
        for (const e of filtered) {
            if (!g[e.category]) g[e.category] = [];
            g[e.category].push(e);
        }
        return g;
    }, [filtered]);

    // All changes across both themes — used by diff display and header count
    const changed = useMemo(() => {
        type ChangedTheme = ThemeKey | 'primitives';
        const result: Array<{ entry: TokenEntry; theme: ChangedTheme }> = [];
        // Semantic changes per theme
        for (const theme of ['light', 'dark'] as ThemeKey[]) {
            const themeOvr = overridesPerTheme[theme];
            const semEntries = theme === 'dark' ? DARK_SEMANTIC_ENTRIES : SEMANTIC_ENTRIES;
            for (const e of semEntries) {
                if (refOverridesPerTheme[theme][e.cssVar]) {
                    result.push({ entry: e, theme });
                } else if (themeOvr[e.cssVar] && (!linkedVars.has(e.cssVar) || !e.baseHex.startsWith('#'))) {
                    result.push({ entry: e, theme });
                }
            }
        }
        // Primitive changes are theme-agnostic — deduplicate across both theme override maps
        const seenPrimitives = new Set<string>();
        for (const theme of ['light', 'dark'] as ThemeKey[]) {
            for (const e of PRIMITIVE_ENTRIES) {
                if (!isPrimitiveLeaf(e) || !overridesPerTheme[theme][e.cssVar]) continue;
                if (!seenPrimitives.has(e.cssVar)) {
                    seenPrimitives.add(e.cssVar);
                    result.push({ entry: e, theme: 'primitives' });
                }
            }
        }
        return result;
    }, [overridesPerTheme, refOverridesPerTheme, linkedVars]);

    const commit = useCallback((cssVar: string, val: string) => {
        const theme: ThemeKey = darkMode ? 'dark' : 'light';
        setOriginalsPerTheme((prev) => {
            if (cssVar in prev[theme]) return prev;
            const before = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
            return { ...prev, [theme]: { ...prev[theme], [cssVar]: before || '#000000' } };
        });
        document.documentElement.style.setProperty(cssVar, val);
        const entryMap = darkMode ? DARK_ENTRIES_BY_VAR : ENTRIES_BY_VAR;
        const semEntries = darkMode ? DARK_SEMANTIC_ENTRIES : SEMANTIC_ENTRIES;
        const entry = entryMap.get(cssVar);
        const chainVars = getChainVars(entry, linkedVars.has(cssVar), semEntries);
        for (const v of chainVars) document.documentElement.style.setProperty(v, val);
        setOverridesPerTheme((prev) => {
            const next: BiThemeOverrides = { ...prev, [theme]: { ...prev[theme], [cssVar]: val } };
            for (const v of chainVars) next[theme] = { ...next[theme], [v]: val };
            saveOverrides(next);
            return next;
        });
    }, [darkMode, linkedVars]);

    const commitRef = useCallback((cssVar: string, newRef: string) => {
        const theme: ThemeKey = darkMode ? 'dark' : 'light';
        setRefOverridesPerTheme((prev) => ({ ...prev, [theme]: { ...prev[theme], [cssVar]: newRef } }));
        const directHex = resolveRef(newRef);
        const liveHex = directHex.startsWith('#')
            ? directHex
            : getComputedStyle(document.documentElement)
                  .getPropertyValue('--' + newRef.slice(1, -1).split('.').map(toKebab).join('-'))
                  .trim();
        if (!liveHex.startsWith('#')) return;
        setOriginalsPerTheme((prev) => {
            if (cssVar in prev[theme]) return prev;
            const before = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
            return { ...prev, [theme]: { ...prev[theme], [cssVar]: before || '#000000' } };
        });
        document.documentElement.style.setProperty(cssVar, liveHex);
        setOverridesPerTheme((prev) => {
            const next: BiThemeOverrides = { ...prev, [theme]: { ...prev[theme], [cssVar]: liveHex } };
            saveOverrides(next);
            return next;
        });
    }, [darkMode]);

    const filterByRef = useCallback((ref: string) => {
        setPrimitiveFilter((prev) => (prev === ref ? null : ref));
    }, []);

    const jumpToPrimitive = useCallback((ref: string) => {
        // Dereference: {color.neutral.800} → --ds-color-neutral-800
        const cssVar = '--ds-' + ref.slice(1, -1).split('.').map(toKebab).join('-');
        setMode('primitive');
        setScrollTarget(cssVar);
    }, []);

    const toggleLink = useCallback((cssVar: string) => {
        setLinkedVars((prev) => {
            const next = new Set(prev);
            if (next.has(cssVar)) next.delete(cssVar);
            else next.add(cssVar);
            return next;
        });
    }, []);

    const reset = useCallback((cssVar: string) => {
        const theme: ThemeKey = darkMode ? 'dark' : 'light';
        document.documentElement.style.removeProperty(cssVar);
        const entryMap = darkMode ? DARK_ENTRIES_BY_VAR : ENTRIES_BY_VAR;
        const semEntries = darkMode ? DARK_SEMANTIC_ENTRIES : SEMANTIC_ENTRIES;
        const entry = entryMap.get(cssVar);
        const chainVars = getChainVars(entry, linkedVars.has(cssVar), semEntries);
        for (const v of chainVars) document.documentElement.style.removeProperty(v);
        setOverridesPerTheme((prev) => {
            const next: BiThemeOverrides = { ...prev, [theme]: { ...prev[theme] } };
            delete next[theme][cssVar];
            for (const v of chainVars) delete next[theme][v];
            saveOverrides(next);
            return next;
        });
        setOriginalsPerTheme((prev) => {
            const next: BiThemeOverrides = { ...prev, [theme]: { ...prev[theme] } };
            delete next[theme][cssVar];
            return next;
        });
        setLinkedVars((prev) => { const n = new Set(prev); n.delete(cssVar); return n; });
        setRefOverridesPerTheme((prev) => { const n: BiThemeOverrides = { ...prev, [theme]: { ...prev[theme] } }; delete n[theme][cssVar]; return n; });
    }, [darkMode, linkedVars]);

    const resetAll = useCallback(() => {
        // Clear both themes from DOM and state
        for (const e of ALL_ENTRIES) {
            document.documentElement.style.removeProperty(e.cssVar);
            for (const v of getChainVars(e, linkedVars.has(e.cssVar))) document.documentElement.style.removeProperty(v);
        }
        const empty: BiThemeOverrides = { ...EMPTY_BI };
        setOverridesPerTheme(empty);
        setOriginalsPerTheme({ ...EMPTY_BI });
        setLinkedVars(new Set());
        setRefOverridesPerTheme({ ...EMPTY_BI });
        setShowDiff(false);
        saveOverrides(empty);
    }, [linkedVars]);

    const exportDiff = useCallback(() => {
        const json = buildExport(overridesPerTheme, linkedVars, refOverridesPerTheme);
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: 'token-overrides.json' });
        a.click();
        URL.revokeObjectURL(url);
    }, [overridesPerTheme, linkedVars, refOverridesPerTheme]);

    return (
        <>
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border-muted px-4 py-3">
                <div className="flex items-center gap-1">
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={onBack} className="size-6 text-text-muted hover:text-text-default">
                                <ArrowLeft className="size-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Back to Dev Tools</TooltipContent>
                    </Tooltip>
                    <span className="font-medium text-text-default">Token Editor</span>
                    {changed.length > 0 && (
                        <span className="ml-1 rounded bg-status-info-bg px-1.5 py-0.5 font-mono text-xs text-status-info-text">{changed.length} changed</span>
                    )}
                </div>
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={onClose} className="size-6 text-text-muted hover:text-text-default">
                            <X className="size-3.5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Close</TooltipContent>
                </Tooltip>
            </div>

            {/* View controls bar: mode toggle + search + filter + theme */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border-muted px-4 py-2">
                {/* Segment toggle */}
                <div className="flex h-8 shrink-0 overflow-hidden rounded border border-border-muted bg-surface-panel-inset text-sm">
                    <button
                        onClick={() => setMode('semantic')}
                        className={`cursor-pointer px-3 ${mode === 'semantic' ? 'bg-surface-panel text-text-default' : 'text-text-muted hover:text-text-default'}`}
                    >
                        Semantic
                    </button>
                    <button
                        onClick={() => setMode('primitive')}
                        className={`cursor-pointer px-3 ${mode === 'primitive' ? 'bg-surface-panel text-text-default' : 'text-text-muted hover:text-text-default'}`}
                    >
                        Primitives
                    </button>
                </div>
                <Input
                    type="search"
                    placeholder="Search tokens…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 flex-1 font-mono text-xs"
                />
                {mode === 'semantic' && (
                    <FilterPicker value={primitiveFilter} onChange={setPrimitiveFilter} />
                )}
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={toggleDarkMode} className="size-8 shrink-0 text-text-muted hover:text-text-default">
                            {darkMode ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{darkMode ? 'Switch to light' : 'Switch to dark'}</TooltipContent>
                </Tooltip>
            </div>

            {/* Token list */}
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
                {Object.entries(grouped).map(([category, categoryEntries]) => (
                    <div key={category}>
                        <p className="sticky top-0 z-10 bg-surface-panel-muted px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                            {category}
                        </p>
                        {categoryEntries.map((entry) => (
                            <TokenRow
                                key={entry.cssVar}
                                entry={entry}
                                override={activeOverrides[entry.cssVar]}
                                refOverride={activeRefOverrides[entry.cssVar]}
                                linked={linkedVars.has(entry.cssVar)}
                                onCommit={commit}
                                onReset={reset}
                                onToggleLink={toggleLink}
                                themeSeq={themeSeq}
                                onFilterByRef={filterByRef}
                                onJumpToPrimitive={jumpToPrimitive}
                                onPickRef={commitRef}
                                showRef={true}
                            />
                        ))}
                    </div>
                ))}
                {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-text-muted">No tokens match your filter.</p>}
            </div>

            {/* Diff section — grouped by theme */}
            {showDiff && changed.length > 0 && (
                <div className="flex max-h-[50%] shrink-0 flex-col overflow-y-auto border-t border-border-muted bg-surface-page pt-1">
                    {(['light', 'dark', 'primitives'] as const).map((theme) => {
                        const themeChanges = changed.filter((c) => c.theme === theme);
                        if (!themeChanges.length) return null;
                        // For primitives use whichever theme's override/original is set
                        const themeOvr = theme === 'primitives'
                            ? { ...overridesPerTheme.light, ...overridesPerTheme.dark }
                            : overridesPerTheme[theme];
                        const themeOrig = theme === 'primitives'
                            ? { ...originalsPerTheme.light, ...originalsPerTheme.dark }
                            : originalsPerTheme[theme];
                        return (
                            <div key={theme}>
                                <p className="sticky top-0 mt-1 bg-surface-page px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                                    {theme === 'primitives' ? 'Primitive changes' : theme === 'light' ? 'Semantic/Light changes' : 'Semantic/Dark changes'}
                                </p>
                                {themeChanges.map(({ entry }) => {
                                    const newRef = theme !== 'primitives' ? refOverridesPerTheme[theme][entry.cssVar] : undefined;
                                    const fromHex = themeOrig[entry.cssVar] ?? entry.baseHex;
                                    const toHex = themeOvr[entry.cssVar] ?? '';
                                    const fromLabel = newRef ? shortRefLabel(entry.displayRef ?? entry.primitiveRef ?? '') : fromHex;
                                    const toLabel = newRef ? shortRefLabel(newRef) : toHex;
                                    return (
                                        <div key={entry.cssVar} className="flex items-center gap-2 px-4 py-1 text-xs">
                                            <span className="min-w-0 flex-1 truncate font-mono text-text-muted">{entry.cssVar}</span>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <div className="size-4 shrink-0 rounded-sm border border-border-muted" style={{ backgroundColor: fromHex }} />
                                                <span className="font-mono text-text-muted">{fromLabel}</span>
                                            </div>
                                            <span className="shrink-0 text-text-muted">→</span>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <div className="size-4 shrink-0 rounded-sm border border-border-muted" style={{ backgroundColor: toHex }} />
                                                <span className="font-mono text-text-default">{toLabel}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                    <div className="h-2" />
                </div>
            )}

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-border-muted px-4 py-2">
                <Button variant="ghost" size="sm" onClick={() => setShowDiff(!showDiff)} disabled={changed.length === 0} className="gap-1">
                    {showDiff ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    Show diff
                    {changed.length > 0 && (
                        <span className="rounded bg-status-info-bg px-1 font-mono text-xs text-status-info-text">{changed.length}</span>
                    )}
                </Button>
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" disabled={changed.length === 0} onClick={exportDiff} className="gap-1.5">
                        <Download className="size-3.5" />
                        Export diff
                    </Button>
                    <Button variant="ghost" size="sm" disabled={changed.length === 0} onClick={resetAll} className="gap-1.5">
                        <RotateCcw className="size-3.5" />
                        Reset all
                    </Button>
                </div>
            </div>
        </>
    );
}
