import * as z from 'zod/v4';

export const searchDocsInputSchema = z
    .object({
        query: z.string().min(1).describe('Search query')
    })
    .strict();

export const searchDocsOutputSchema = z
    .object({
        results: z.array(z.string())
    })
    .strict();

export const queryDocsFilesystemInputSchema = z
    .object({
        command: z
            .string()
            .min(1)
            .describe('A read-only shell command to run against the virtual Nango documentation filesystem, such as `head -80 /quickstart.mdx`.')
    })
    .strict();

export const queryDocsFilesystemOutputSchema = z
    .object({
        output: z.string()
    })
    .strict();

export type SearchDocsOutput = z.infer<typeof searchDocsOutputSchema>;
export type QueryDocsFilesystemOutput = z.infer<typeof queryDocsFilesystemOutputSchema>;
