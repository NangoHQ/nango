import type { NangoSync, SlackMessage, SlackMessageReaction, SlackMessageReply } from './models';
import { createHash } from 'crypto';

export default async function fetchData(nango: NangoSync) {
    let batchMessages: SlackMessage[] = [];
    let batchMessageReply: SlackMessageReply[] = [];

    let metadata = (await nango.getMetadata()) || {};
    let channelsLastSyncDate = (metadata['channelsLastSyncDate'] as Record<string, string>) || {};
    let unseenChannels = Object.keys(channelsLastSyncDate);

    const channelsRequestConfig = {
        endpoint: 'users.conversations',
        paginate: {
            limit: 200,
            response_path: 'channels'
        }
    };

    // For every channel read messages, replies & reactions
    for await (const currentChannel of getEntries(nango.paginate(channelsRequestConfig))) {
        const channelSyncTimestamp = (channelsLastSyncDate[currentChannel.id] as string)
            ? new Date(new Date().setDate(new Date().getDate() - 10)).getTime() / 1000
            : '';
        channelsLastSyncDate[currentChannel.id] = new Date().toString();

        // Keep track of channels we no longer saw in the API
        if (unseenChannels.includes(currentChannel.id)) {
            unseenChannels.splice(unseenChannels.indexOf(currentChannel.id), 1);
        }

        await nango.log(
            `Processing channel: ${currentChannel.id} - ${
                channelSyncTimestamp === '' ? 'Initial sync, getting whole history' : 'Incremential sync, re-syncing last 10 days'
            }`
        );

        const messagesRequestConfig = {
            endpoint: 'conversations.history',
            params: {
                channel: currentChannel['id'],
                oldest: channelSyncTimestamp.toString()
            },
            paginate: {
                limit: 200,
                response_path: 'messages'
            }
        };

        for await (let message of getEntries(nango.paginate(messagesRequestConfig))) {
            message = message as Record<string, any>;
            const mappedMessage: SlackMessage = {
                id: createHash('sha256').update(`${message.ts}${currentChannel.id}`).digest('hex'),
                ts: message.ts,
                channel_id: currentChannel.id,
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

            // Save reactions if there are
            if (message.reactions) {
                await saveReactions(nango, currentChannel.id, message);
            }

            // Replies to fetch?
            if (message.reply_count > 0) {
                const messagesReplyRequestConfig = {
                    endpoint: 'conversations.replies',
                    params: {
                        channel: currentChannel.id,
                        ts: message.thread_ts
                    },
                    paginate: {
                        limit: 200,
                        response_path: 'messages'
                    }
                };

                for await (const reply of getEntries(nango.paginate(messagesReplyRequestConfig))) {
                    if (reply.ts === message.ts) {
                        continue;
                    }

                    const mappedReply: SlackMessageReply = {
                        id: createHash('sha256').update(`${reply.ts}${currentChannel.id}`).digest('hex'),
                        ts: reply.ts,
                        channel_id: currentChannel.id,
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

                    // Save reactions if there are
                    if (reply.reactions) {
                        await saveReactions(nango, currentChannel.id, reply);
                    }
                }
            }
        }
    }
    await nango.batchSave(batchMessages, 'SlackMessage');
    await nango.batchSave(batchMessageReply, 'SlackMessageReply');

    // Remove channels we no longer saw
    if (unseenChannels.length > 0) {
        for (const channel of unseenChannels) {
            delete channelsLastSyncDate[channel];
        }
    }

    // Store last sync date per channel
    metadata = (await nango.getMetadata()) || {}; // Re-read current metadata, in case it has been changed whilst the sync ran
    metadata['channelsLastSyncDate'] = channelsLastSyncDate;
    await nango.setMetadata(metadata as Record<string, any>);
}

async function saveReactions(nango: NangoSync, currentChannelId: string, message: any) {
    let batchReactions: SlackMessageReaction[] = [];

    for (let reaction of message.reactions) {
        for (let user of reaction.users) {
            const mappedReaction: SlackMessageReaction = {
                id: createHash('sha256').update(`${message.ts}${reaction.name}${currentChannelId}${user}`).digest('hex'),
                message_ts: message.ts,
                channel_id: currentChannelId,
                user_id: user,
                thread_ts: message.thread_ts ? message.thread_ts : null,
                reaction_name: reaction.name
            };

            batchReactions.push(mappedReaction);
        }
    }

    await nango.batchSave<SlackMessageReaction>(batchReactions, 'SlackMessageReaction');
}

async function* getEntries(generator: AsyncGenerator<any[]>): any {
    for await (const entry of generator) {
        for (const child of entry) {
            yield child;
        }
    }
}
