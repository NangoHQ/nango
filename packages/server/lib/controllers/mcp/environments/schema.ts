import * as z from 'zod/v4';

export const listEnvironmentsInputSchema = z.object({}).strict();

export const listEnvironmentsOutputSchema = z.object({
    environments: z.array(
        z.object({
            name: z.string(),
            is_production: z.boolean()
        })
    )
});

export type ListEnvironmentsOutput = z.infer<typeof listEnvironmentsOutputSchema>;
