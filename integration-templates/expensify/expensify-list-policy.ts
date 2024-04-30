import type { NangoAction, ExpensifyListPolicyOutput, ExpensifyListPolicyInput } from './models';

export default async function runAction(nango: NangoAction, input: ExpensifyListPolicyInput): Promise<ExpensifyListPolicyOutput> {
    //input validation
    if (!input.requestJobDescription.type) {
        throw new nango.ActionError({
            message: 'requestJobDescription type is a required field in requestJobDescription'
        });
    } else if (!input.inputSettings.type) {
        throw new nango.ActionError({
            message: 'inputSettings type is a required field in inputSettings'
        });
    }

    const connection = await nango.getConnection();

    try {
        let credentials: { partnerUserID?: string; partnerUserSecret?: string } = {};
        if ('username' in connection.credentials && 'password' in connection.credentials) {
            credentials = {
                partnerUserID: connection.credentials.username,
                partnerUserSecret: connection.credentials.password
            };
        } else {
            throw new nango.ActionError({
                message: `Basic API credentials are incomplete`
            });
        }
        const postData =
            'requestJobDescription=' +
            encodeURIComponent(
                JSON.stringify({
                    type: input.requestJobDescription.type,
                    credentials: credentials,
                    inputSettings: {
                        type: input.inputSettings.type
                    }
                })
            );

        const resp = await nango.post({
            baseUrlOverride: `https://integrations.expensify.com/Integration-Server`,
            endpoint: `/ExpensifyIntegrations`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: postData
        });

        const { policyList } = resp.data;

        return { policyList };
    } catch (error) {
        throw new nango.ActionError({
            message: `Error in runAction: ${error}`
        });
    }
}
