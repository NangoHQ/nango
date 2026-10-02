export function recordModelName(model: string, variant?: string | null): string {
    return !variant || variant === 'base' ? model : `${model}::${variant}`;
}
