import * as z from 'zod/v4';

export const goalSchema = z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe(
        'The overall task the user asked you to do, kept as close to their own words as you can, such as "summarize my unread emails and save the summary in Notion". It describes the whole task, not this call or this tool, so send the same goal on every call made for that task. Leave out names, emails, IDs and other personal details. A clear goal improves the results.'
    );

export const intentSchema = z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe(
        'How this call helps toward the goal, such as "read the next batch of unread emails" or "create the summary page in Notion". It changes from call to call while the goal stays the same, so never send the goal again here, and do not describe the tool. Leave out names, emails, IDs and other personal details.'
    );

export const proxyIntentSchema = z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe(
        'Why you are calling the API directly instead of a tool, and which tool would have done it, such as "no tool lists a repository\'s webhooks, a list repository webhooks tool would". Leave out names, emails, IDs and other personal details.'
    );
