import { SlackMessage, SlackMessageReaction, SlackMessageReply, NangoSync } from './models';
import { createHash } from 'crypto';

export default async function fetchData(nango: NangoSync) {
    // Get all channels we are part of
    let channels = await getAllPages(nango, 'users.conversations', {}, 'channels');

    await nango.log(`Bot is part of ${channels.length} channels`);

    const oldestTimestamp = nango.lastSyncDate ? new Date(new Date().setDate(new Date().getDate() - 10)).getTime() / 1000 : '';
    await nango.log(`Sync last ran ${nango.lastSyncDate} - querying for messages since ${oldestTimestamp}`);

    let batchMessages: SlackMessage[] = [];
    let batchMessageReply: SlackMessageReply[] = [];
    let batchReactions: SlackMessageReaction[] = [];

    // For every channel read messages, replies & reactions
    for (let channel of channels) {
        let allMessages = await getAllPages(nango, 'conversations.history', { channel: channel.id, oldest: oldestTimestamp.toString() }, 'messages');

        for (let message of allMessages) {
            const mappedMessage: SlackMessage = {
                id: createHash('sha256').update(`${message.ts}${channel.id}`).digest('hex'),
                ts: message.ts,
                channel_id: channel.id,
                thread_ts: message.thread_ts ? message.thread_ts : null,
                app_id: message.app_id ? message.app_id : null,
                bot_id: message.bot_id ? message.bot_id : null,
                display_as_bot: message.display_as_bot ? message.display_as_bot : null,
                is_locked: message.is_locked ? message.is_locked : null,
                metadata: {
                    event_type: message.type
                },
                parent_user_id: message.parent_user_id ? message.parent_user_id : null,
                subtype: message.subtype ? message.subtype : null,
                text: message.text ? message.text : null,
                topic: message.topic ? message.topic : null,
                user_id: message.user ? message.user : null,
                raw_json: JSON.stringify(message)
            };

            batchMessages.push(mappedMessage);

            if (batchMessages.length > 49) {
                await nango.batchSave<SlackMessage>(batchMessages, 'SlackMessage');
                batchMessages = [];
            }

            // Are there reactions?
            if (message.reactions) {
                for (let reaction of message.reactions) {
                    for (let user of reaction.users) {
                        const mappedReaction: SlackMessageReaction = {
                            id: createHash('sha256').update(`${message.ts}${reaction.name}${channel.id}${user}`).digest('hex'),
                            message_ts: message.ts,
                            channel_id: channel.id,
                            user_id: user,
                            thread_ts: message.thread_ts ? message.thread_ts : null,
                            reaction_name: reaction.name
                        };

                        batchReactions.push(mappedReaction);

                        if (batchReactions.length > 49) {
                            await nango.batchSave<SlackMessageReaction>(batchReactions, 'SlackMessageReaction');
                            batchReactions = [];
                        }
                    }
                }
            }

            // Replies to fetch?
            if (message.reply_count > 0) {
                const allReplies = await getAllPages(nango, 'conversations.replies', { channel: channel.id, ts: message.thread_ts }, 'messages');

                for (let reply of allReplies) {
                    if (reply.ts === message.ts) {
                        continue;
                    }

                    const mappedReply: SlackMessageReply = {
                        id: createHash('sha256').update(`${reply.ts}${channel.id}`).digest('hex'),
                        ts: reply.ts,
                        channel_id: channel.id,
                        thread_ts: reply.thread_ts ? reply.thread_ts : null,
                        app_id: reply.app_id ? reply.app_id : null,
                        bot_id: reply.bot_id ? reply.bot_id : null,
                        display_as_bot: reply.display_as_bot ? reply.display_as_bot : null,
                        is_locked: reply.is_locked ? reply.is_locked : null,
                        metadata: {
                            event_type: reply.type
                        },
                        parent_user_id: reply.parent_user_id ? reply.parent_user_id : null,
                        subtype: reply.subtype ? reply.subtype : null,
                        text: reply.text ? reply.text : null,
                        topic: reply.topic ? reply.topic : null,
                        user_id: reply.user ? reply.user : null,
                        root: {
                            message_id: message.client_message_id,
                            ts: message.thread_ts
                        },
                        raw_json: JSON.stringify(reply)
                    };

                    batchMessageReply.push(mappedReply);

                    if (batchMessageReply.length > 49) {
                        await nango.batchSave<SlackMessageReply>(batchMessageReply, 'SlackMessageReply');
                        batchMessageReply = [];
                    }

                    // Are there reactions
                    if (reply.reactions) {
                        for (let reaction of reply.reactions) {
                            for (let user of reaction.users) {
                                const mappedReaction: SlackMessageReaction = {
                                    id: createHash('sha256').update(`${reply.ts}${reaction.name}${channel.id}${user}`).digest('hex'),
                                    message_ts: reply.ts,
                                    channel_id: channel.id,
                                    user_id: user,
                                    thread_ts: reply.thread_ts ? reply.thread_ts : null,
                                    reaction_name: reaction.name
                                };

                                batchReactions.push(mappedReaction);

                                if (batchReactions.length > 49) {
                                    await nango.batchSave<SlackMessageReaction>(batchReactions, 'SlackMessageReaction');
                                    batchReactions = [];
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    await nango.batchSave(batchMessages, 'SlackMessage');
    await nango.batchSave(batchMessageReply, 'SlackMessageReply');
    await nango.batchSave(batchReactions, 'SlackMessageReaction');
}

async function getAllPages(nango: NangoSync, endpoint: string, params: Record<string, string>, resultsKey: string) {
    let nextCursor = 'x';
    let responses: any[] = [];

    while (nextCursor !== '') {
        const response = await nango.get({
            endpoint: endpoint,
            params: {
                limit: '200',
                cursor: nextCursor !== 'x' ? nextCursor : '',
                ...params
            },
            retries: 10
        });

        if (!response.data.ok) {
            await nango.log(`Received a Slack API error (for ${endpoint}): ${JSON.stringify(response.data, null, 2)}`);
        }

        const results = response.data[resultsKey];
        const response_metadata = response.data.response_metadata;

        responses = responses.concat(results);
        nextCursor = response_metadata && response_metadata.next_cursor ? response_metadata.next_cursor : '';
    }

    return responses;
}
