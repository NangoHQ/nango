import type * as z from 'zod';

export type ZodMetadata = z.ZodObject | z.ZodVoid | undefined;

export type ZodModel = z.ZodObject<{ id: z.ZodString }>;
export interface RawModel {
    [key: string]: unknown;
    id: string;
}
