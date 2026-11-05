import * as z from 'zod/v4';

export const goalSchema = z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe(
        'The task the user asked you to do, kept as close to their own words as you can, such as "get my unread emails from Gmail, summarize them and save the summary in Notion". Send the same goal on every call made for that task. Leave out names, emails, IDs and other personal details. A clear goal improves the results.'
    );

export const intentSchema = z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe(
        'Why you are calling this tool, such as "read the next batch of unread emails". It changes from call to call, the goal does not. Leave out names, emails, IDs and other personal details.'
    );
