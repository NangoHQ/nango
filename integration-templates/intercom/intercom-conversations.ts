import type { NangoSync, IntercomConversation, IntercomConversationMessage } from './models';

/**
 * Fetches Intercom conversations with all their associated messages and notes.
 *
 * Note that Intercom has a hard limit of 500 message parts (messages/notes/actions etc.) returned per conversation.
 * If a conversation has more than 500 parts some will be missing.
 * Only fetches parts that have a message body, ignores parts which are pure actions & metadata (e.g. closed conversation).
 *
 * ====
 *
 * Initial sync: Fetches conversations updated in the last X years (default: X=2)
 * Incremential sync: Fetches the conversations that have been updates since the last sync (updated_at date from Intercom, seems to be reliable)
 */

export default async function fetchData(nango: NangoSync) {
    // Intercom uses unix timestamp for datetimes.
    // Convert the last sync run date into a unix timestamp for easier comparison.
    const lastSyncDateTimestamp = nango.lastSyncDate ? nango.lastSyncDate.getTime() / 1000 : 0;

    // We also define a max sync date for incremential syncs, which is conversations updated in the last X years
    const maxYearsToSync = 2;
    const maxSyncDate = new Date();
    maxSyncDate.setFullYear(new Date().getFullYear() - maxYearsToSync);
    const maxSyncDateTimestamp = maxSyncDate.getTime() / 1000;

    // Get the list of conversations
    // Not documented, but from testing it seems the list is sorted by updated_at DESC
    // https://developers.intercom.com/intercom-api-reference/reference/listconversations
    let finished = false;
    let nextPage = '';
    while (!finished) {
        // This API endpoint has an annoying bug: If you pass "starting_after" with no value you get a 500 server error
        // Because of this we only set it here when we are fetching page >= 2, otherwise we don't pass it.
        const queryParams: Record<string, string> = {
            per_page: '150'
        };

        if (nextPage !== '') {
            queryParams['starting_after'] = nextPage;
        }

        // Make the API request with Nango
        const resp = await nango.get({
            baseUrlOverride: 'https://api.intercom.io/',
            endpoint: 'conversations',
            retries: 5,
            headers: {
                'Intercom-Version': '2.9'
            },
            params: queryParams
        });

        // Let's iterate over the received conversations
        // Then get the details for each.
        const intercomConversationsPage: IntercomConversation[] = [];
        const intercomMessagesPage: IntercomConversationMessage[] = [];
        for (const conversation of resp.data.conversations) {
            // For incremential syncs: Skip conversations that have not been updated since we last synced
            // updated_at is a unix timestamp of the last change to the conversation (e.g. new message from customer, attribute changed)
            if (conversation.updated_at < lastSyncDateTimestamp) {
                continue;
            }

            // Get the details of the conversation
            // https://developers.intercom.com/intercom-api-reference/reference/retrieveconversation
            const conversationResp = await nango.get({
                baseUrlOverride: 'https://api.intercom.io/',
                endpoint: `conversations/${conversation.id}`,
                retries: 5,
                headers: {
                    'Intercom-Version': '2.9'
                },
                params: {
                    display_as: 'plaintext'
                }
            });

            // Map the Intercom conversation to our own data model
            intercomConversationsPage.push({
                id: conversationResp.data.id,
                created_at: conversationResp.data.created_at,
                updated_at: conversationResp.data.updated_at,
                waiting_since: conversationResp.data.waiting_since ? conversationResp.data.waiting_since : null,
                snoozed_until: conversationResp.data.snoozed_until ? conversationResp.data.snoozed_until : null,
                title: conversationResp.data.title,
                contacts: conversationResp.data.contacts.contacts.map((contact: any) => {
                    return { contact_id: contact.id };
                }),
                state: conversationResp.data.state,
                open: conversationResp.data.open,
                read: conversationResp.data.read,
                priority: conversationResp.data.priority
            });

            // Map the messages (called "message parts" by Intercom)
            // First message is treated special as the "source" by Intercom
            intercomMessagesPage.push({
                id: conversationResp.data.source.id,
                conversation_id: conversationResp.data.id,
                body: conversationResp.data.source.body,
                type: 'comment',
                created_at: conversationResp.data.created_at,
                updated_at: null,
                author: {
                    type: mapAuthorType(conversationResp.data.source.author.type),
                    name: conversationResp.data.source.name,
                    id: conversationResp.data.source.id
                }
            });

            for (const conversationPart of conversationResp.data.conversation_parts.conversation_parts) {
                // Conversation parts can be messages, notes etc. but also actions, such as "closed conversation", "assigned conversation" etc.
                // We only care about the conversation parts where admins and users send a message.
                // For a full list of possible part types see here: https://developers.intercom.com/intercom-api-reference/reference/the-conversation-model#conversation-part-types
                if (conversationPart.body === null) {
                    continue;
                }

                intercomMessagesPage.push({
                    id: conversationPart.id,
                    conversation_id: conversationResp.data.id,
                    body: conversationPart.body,
                    type: mapMessagePartType(conversationPart.part_type),
                    created_at: conversationPart.created_at,
                    updated_at: conversationPart.updated_at ? conversationPart.updated_at : null,
                    author: {
                        type: mapAuthorType(conversationPart.author.type),
                        name: conversationPart.author.name,
                        id: conversationPart.author.id
                    }
                });
            }
        }

        // Store this page of conversations in Nango
        await nango.batchSave(intercomConversationsPage, 'IntercomConversation');
        await nango.batchSave(intercomMessagesPage, 'IntercomConversationMessage');

        // Get the last conversation of the page
        // We use this to determine if we should keep on syncing further pages
        const lastConversation = resp.data.conversations.at(-1);

        // We stop syncing if there are no more pages
        if (!resp.data.pages.next) {
            finished = true;
        }

        // OR one of the following conditions has been reached:

        // 1.) We are in an initial sync (last sync timestamp == 0) and we have reached the maxSyncDate
        if (lastSyncDateTimestamp === 0 && lastConversation.updated_at <= maxSyncDateTimestamp) {
            finished = true;
        }

        // 2.) We are in an incremential sync and the last conversation on the page is older than our last sync date
        if (lastSyncDateTimestamp > 0 && lastConversation.updated_at < lastSyncDateTimestamp) {
            finished = true;
        }

        // None of the above is true, let's fetch the next page
        if (!finished) {
            nextPage = resp.data.pages.next.starting_after;
        }
    }
}

function mapMessagePartType(rawType: string): string {
    if (rawType === 'assignment') {
        return 'comment';
    } else {
        // Other options with body I have seen: "comment", "note"
        return rawType;
    }
}

function mapAuthorType(rawType: string): string {
    if (rawType === 'team') {
        return 'admin';
    } else if (rawType === 'lead') {
        return 'user';
    } else {
        // Other options are: "admin", "bot", "user"
        return rawType;
    }
}
