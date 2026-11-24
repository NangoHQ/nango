import * as z from 'zod/v4';

import { goalSchema } from '../purposeSchema.js';

const MAX_TOOL_SEARCH_QUERIES = 5;

export const toolSearchInputSchema = z
    .object({
        queries: z
            .array(
                z
                    .string()
                    .trim()
                    .min(1)
                    .max(255)
                    .describe(
                        'A few keywords naming the action and what it acts on, such as "list calendar events". Leave out the app\'s name, because every tool of that app matches it.'
                    )
            )
            .min(1)
            .max(MAX_TOOL_SEARCH_QUERIES)
            .describe('One query per tool the task needs, such as ["list calendar events", "send an email"]. Each is searched on its own.'),
        goal: goalSchema
    })
    .strict();

const inputSchema = z.discriminatedUnion('kind', [
    z
        .object({ kind: z.literal('schema'), schema: z.looseObject({}) })
        .strict()
        .describe('A JSON Schema document rooted at its $ref.'),
    z
        .object({ kind: z.literal('none') })
        .strict()
        .describe('The tool takes no input.'),
    z
        .object({ kind: z.literal('unavailable') })
        .strict()
        .describe('The input could not be read, so it has to be guessed.')
]);

const relatedSchema = z
    .object({
        tool: z.string().describe("Pass as nango_execute's tool argument, exactly as given."),
        integration: z.string().describe('Look it up in integrations to see whether it is connected.'),
        description: z.string()
    })
    .strict();

const matchSchema = relatedSchema
    .extend({
        input: inputSchema,
        _meta: z
            .object({ 'nango/tags': z.record(z.string(), z.union([z.string(), z.array(z.string())])) })
            .strict()
            .optional()
            .describe("The tags the tool's author set on it, keyed as on a listed tool.")
    })
    .strict();

const queryResultSchema = z
    .object({
        query: z.string(),
        guidance: z.string().optional().describe('Only when there is something to say about this query in particular.'),
        matches: z.array(matchSchema).describe('Tools that fit the query, returned with their input and ready to call.'),
        related: z.array(relatedSchema).describe('Weaker matches, without their input. Leads to search again on rather than tools to call.')
    })
    .strict();

export const toolSearchOutputSchema = z
    .object({
        guidance: z.string(),
        integrations: z
            .record(z.string(), z.enum(['connected', 'not_connected']))
            .describe('Whether each integration the results name is connected. A tool on an unconnected integration fails when called.'),
        results: z.array(queryResultSchema).describe('One result per query, in the order the queries were sent.')
    })
    .strict();
