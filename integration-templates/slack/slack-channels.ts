import type { SlackChannel, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    const responses = await getAllChannels(nango, 'conversations.list');

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
    await joinPublicChannels(nango, mappedChannels);

    // console.log(mappedChannels)
    // Save channels
    await nango.batchSave(mappedChannels, 'SlackChannel');
}

// Checks for public channels where the bot is not a member yet and joins them
async function joinPublicChannels(nango: NangoSync, channels: SlackChannel[]) {
    // Get ID of all channels where we are already a member
    const joinedChannelsResponse = await getAllChannels(nango, 'users.conversations');
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

async function getAllChannels(nango: NangoSync, endpoint: string) {
    const channels: any[] = [];

    const proxyConfig = {
        endpoint,
        paginate: {
            response_data_path: 'channels'
        }
    };
    for await (const channelBatch of nango.paginate(proxyConfig)) {
        channels.push(...channelBatch);
    }

    return channels;
}
