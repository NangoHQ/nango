import type { Role } from '@nangohq/types';

export const roles = ['administrator', 'production_support', 'development_full_access'] as const satisfies readonly Role[];
