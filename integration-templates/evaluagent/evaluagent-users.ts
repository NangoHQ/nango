import type { NangoSync, EvaluAgentUser } from './models';

export default async function fetchData(nango: NangoSync) {
    let payload = {
        endpoint: '/v1/org/users'
    };

    const response = await nango.get(payload);

    let returnedData = response.data.data;

    const mappedUsers: EvaluAgentUser[] = returnedData.map((user: EvaluAgentUser) => ({
        id: user.id,
        forename: user.attributes.forename,
        surname: user.attributes.surname,
        email: user.attributes.email,
        username: user.attributes.username,
        startDate: user.attributes.start_date,
        active: user.attributes.active,
        thirdPartyId: user.attributes.third_party_id
    }));

    if (mappedUsers.length > 0) {
        await nango.batchSave<EvaluAgentUser>(mappedUsers, 'EvaluAgentUser');
        await nango.log(`Sent ${mappedUsers.length} users`);
    }
}
