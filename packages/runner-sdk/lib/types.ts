export type ZodMetadata = Zod.ZodObject<any> | Zod.ZodVoid | undefined;
export type ZodModel = Zod.ZodObject<{ id: Zod.ZodString }>;
export interface RawModel {
    [key: string]: unknown;
    id: string;
}
