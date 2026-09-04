/**
 * Records are keyed by a composite model name. Callers must go through this rather than building the
 * string, because a mismatch does not fail — the lookup just misses and reports zero records.
 */
export function recordModelName(model: string, variant?: string | null): string {
    return !variant || variant === 'base' ? model : `${model}::${variant}`;
}
