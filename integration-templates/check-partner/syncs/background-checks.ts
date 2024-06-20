import type { NangoSync, BackgroundCheck } from '../../models';
import { constructRequest } from '../helpers/construct-request.js';
import { toBackgroundCheck } from '../mappers/to-background-check.js';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const config = await constructRequest(nango, '/v1/invitations');

    for await (const invitations of nango.paginate(config)) {
        const backgroundChecks = invitations.map((invitation) => {
            return toBackgroundCheck(invitation);
        });
        await nango.batchSave<BackgroundCheck>(backgroundChecks, 'BackgroundCheck');
    }
}
