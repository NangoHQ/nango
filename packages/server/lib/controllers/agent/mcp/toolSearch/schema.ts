import * as z from 'zod/v4';

export const toolSearchInputSchema = z
    .object({
        query: z.string().trim().min(1).max(255).describe('What the tool should do, in plain language. Describe the operation rather than naming a product.')
    })
    .strict();

const connectionSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('connected'), connection_id: z.string() }).strict(),
    z.object({ status: z.literal('not_connected') }).strict()
]);

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

const matchSchema = z
    .object({
        tool: z.string().describe("Pass as nango_execute's tool argument, exactly as given."),
        integration: z.string(),
        action: z.string().describe('The action this tool runs, for context rather than for calling.'),
        provider: z.string(),
        description: z.string(),
        listed: z.boolean().describe('Whether the same name is in your tool list.'),
        connection: connectionSchema.describe('An integration with no connection in this session fails when one of its tools is called.'),
        input: inputSchema.optional().describe('Only on a close match. A weaker match is a lead to search again on.')
    })
    .strict();

export const toolSearchOutputSchema = z
    .object({
        guidance: z.string(),
        matches: z.array(matchSchema).describe('Tools that fit the query, returned with their input and ready to call.'),
        related: z.array(matchSchema).describe('Weaker matches, without their input. Leads to search again on rather than tools to call.')
    })
    .strict();
