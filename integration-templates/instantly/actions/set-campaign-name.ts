import type { NangoAction, InstantlySetCampaignNameResponse, InstantlySetCampaignNameInput } from '../../models';

export default async function runAction(nango: NangoAction, input: InstantlySetCampaignNameInput): Promise<InstantlySetCampaignNameResponse> {
    if (!input.campaign_id) {
        throw new nango.ActionError({
            message: 'campaign_id is a required field'
        });
    } else if (!input.name) {
        throw new nango.ActionError({
            message: 'name is a required field'
        });
    }

    try {
        const connection = await nango.getConnection();

        let api_key: string;
        if ('apiKey' in connection.credentials) {
            api_key = connection.credentials.apiKey;
        } else {
            throw new nango.ActionError({
                message: `API key credentials is incomplete`
            });
        }

        const postData = {
            api_key: api_key,
            campaign_id: input.campaign_id,
            name: input.name
        };

        const resp = await nango.post({
            endpoint: `/v1/campaign/set/name`,
            data: postData
        });

        const { status } = resp.data;

        return { status };
    } catch (error) {
        throw new nango.ActionError({
            message: `Error in runAction: ${error}`
        });
    }
}
