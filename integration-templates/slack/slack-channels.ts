import type { SlackChannel, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    const responses = await getAllPages(nango, 'conversations.list');

    let metadata = (await nango.getMetadata()) || {};

    const mappedChannels: SlackChannel[] = responses.map((record: any) => {
        return {
            id: record.id,
            name: record.name,
            is_channel: record.is_channel,
            is_group: record.is_group,
            is_im: record.is_im,
            created: record.created,
            creator: record.creator,
            is_archived: record.is_archived,
            is_general: record.is_general,
            name_normalized: record.name_normalized,
            is_shared: record.is_shared,
            is_private: record.is_private,
            is_mpim: record.is_mpim,
            updated: record.updated,
            num_members: record.num_members,
            raw_json: JSON.stringify(record)
        };
    });

    // Now let's also join all public channels where we are not yet a member
    if (metadata['joinPublicChannels']) {
        await joinPublicChannels(nango, mappedChannels);
    }

    // Save channels
    await nango.batchSave(mappedChannels, 'SlackChannel');
}

// Checks for public channels where the bot is not a member yet and joins them
async function joinPublicChannels(nango: NangoSync, channels: SlackChannel[]) {
    // Get ID of all channels where we are already a member
    const joinedChannelsResponse = await getAllPages(nango, 'users.conversations');
    const channelIds = joinedChannelsResponse.map((record: any) => {
        return record.id;
    });

    // For every public, not shared channel where we are not a member yet, join
    for (const channel of channels) {
        if (!channelIds.includes(channel.id) && channel.is_shared === false && channel.is_private === false) {
            await nango.post({
                endpoint: 'conversations.join',
                data: {
                    channel: channel.id
                }
            });
        }
    }
}

async function getAllPages(nango: NangoSync, endpoint: string) {
    var nextCursor = 'x';
    var responses: any[] = [];

    while (nextCursor !== '') {
        const response = await nango.get({
            endpoint: endpoint,
            params: {
                limit: '200',
                cursor: nextCursor !== 'x' ? nextCursor : ''
            }
        });

        if (!response.data.ok) {
            await nango.log(`Received a Slack API error (for ${endpoint}): ${JSON.stringify(response.data, null, 2)}`);
        }

        const { channels, response_metadata } = response.data;
        responses = responses.concat(channels);
        nextCursor = response_metadata.next_cursor;
    }

    return responses;
}
