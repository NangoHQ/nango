import type { NangoSync, EvaluAgentUser } from './models';

interface EvaluAgentUserResponseCustom {
    third_party_id: string;
    start_date: string;
}
interface EvaluAgentUserResponse {
    id: string;
    attributes: EvaluAgentUser & EvaluAgentUserResponseCustom;
}

export default async function fetchData(nango: NangoSync) {
    const payload = {
        endpoint: '/v1/org/users'
    };

    const response = await nango.get(payload);

    const returnedData = response.data.data;

    const mappedUsers: EvaluAgentUser[] = returnedData.map((user: EvaluAgentUserResponse) => ({
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
