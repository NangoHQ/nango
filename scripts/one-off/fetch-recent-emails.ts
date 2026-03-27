import { z } from 'zod';
import { createAction } from 'nango';
const InputSchema = z.object({});
const EmailSchema = z.object({
    id: z.string(),
    thread_id: z.string(),
    subject: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    date: z.string().optional(),
    snippet: z.string().optional()
});
const OutputSchema = z.object({
    emails: z.array(EmailSchema)
});
function getHeader(headers: Array<{ name: string; value: string }>, name: string): string | undefined {
    const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
    return header?.value;
}
const action = createAction({
    description: 'Fetch the last 5 emails from Gmail',
    version: '1.0.0',
    endpoint: {
        method: 'GET',
        path: '/recent-emails',
        group: 'Emails'
    },
    input: InputSchema,
    output: OutputSchema,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    exec: async (nango, _input): Promise<z.infer<typeof OutputSchema>> => {
        // https://developers.google.com/gmail/api/reference/rest/v1/users.messages/list
        const listResponse = await nango.get({
            endpoint: '/gmail/v1/users/me/messages',
            params: {
                maxResults: '5'
            },
            retries: 3
        });
        const messageIds: string[] = (listResponse.data.messages || []).map((m: { id: string }) => m.id);
        if (messageIds.length === 0) {
            return { emails: [] };
        }
        const emails: z.infer<typeof EmailSchema>[] = [];
        for (const msgId of messageIds) {
            // https://developers.google.com/gmail/api/reference/rest/v1/users.messages/get
            const msgResponse = await nango.get({
                endpoint: `/gmail/v1/users/me/messages/${msgId}`,
                params: {
                    format: 'metadata',
                    metadataHeaders: 'Subject,From,To,Date'
                },
                retries: 3
            });
            const msg = msgResponse.data;
            const headers = msg.payload?.headers || [];
            emails.push({
                id: msg.id,
                thread_id: msg.threadId,
                subject: getHeader(headers, 'Subject'),
                from: getHeader(headers, 'From'),
                to: getHeader(headers, 'To'),
                date: getHeader(headers, 'Date'),
                snippet: msg.snippet
            });
        }
        return { emails };
    }
});
export default action;