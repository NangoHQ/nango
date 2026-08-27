export const BASE_SYNC_VARIANT = 'base';

export function getModelFullName(model: string, variant: string): string {
    return variant === BASE_SYNC_VARIANT ? model : `${model}::${variant}`;
}
