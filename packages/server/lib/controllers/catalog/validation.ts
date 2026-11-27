import * as z from 'zod';

import { normalizeSearch } from '../../services/catalog.service.js';

export const catalogSearchSchema = z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((search) => normalizeSearch(search).length > 0, { message: 'search must contain at least one Latin letter (a-z) or digit' });

export const catalogFunctionTypeFilterSchema = z.enum(['sync', 'tool']);
