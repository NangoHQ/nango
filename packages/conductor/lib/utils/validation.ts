import { z } from 'zod';
import type { Json } from '@nangohq/scheduler';

const jsonLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonSchema: z.ZodType<Json> = z.lazy(() => z.union([jsonLiteralSchema, z.array(jsonSchema), z.record(jsonSchema)]));
