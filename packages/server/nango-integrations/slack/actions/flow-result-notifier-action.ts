import type { NangoAction, SlackMessage, SlackResponse } from '../../models';

export default async function runAction(nango: NangoAction, input: SlackMessage): Promise<SlackResponse | null> {
    const connection = await nango.getConnection();

    const color = input.status === 'open' ? '#e01e5a' : '#36a64f';

    const channel = connection.connection_config['incoming_webhook.channel_id'];

    if (!channel) {
        await nango.log(`Slack Hook channel id not configured for the connection ${nango.connectionId}`);
        return null;
    }

    await nango.post({
        endpoint: 'conversations.join',
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        },
        data: { channel }
    });

    const payload = {
        channel,
        ts: '',
        attachments: [
            {
                color: color,
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: input.content
                        }
                    },
                    ...(input.meta
                        ? [
                              {
                                  type: 'context',
                                  elements: [
                                      {
                                          type: 'mrkdwn',
                                          text: `${input.meta.accountName} (uuid: ${input.meta.accountUuid})`
                                      }
                                  ]
                              }
                          ]
                        : [])
                ]
            }
        ]
    };

    if (input.ts) {
        payload['ts'] = input.ts;
    }

    const response = await nango.post({
        endpoint: input.ts ? 'chat.update' : 'chat.postMessage',
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        },
        data: payload,
        retries: 10
    });

    if (response.data.ok === true) {
        return response.data;
    }

    throw new nango.ActionError({
        message: `Error posting to the Slack channel id ${channel}: ${response.data}`,
        response: response.data
    });
}
