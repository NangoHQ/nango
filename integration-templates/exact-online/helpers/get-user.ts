import type { NangoAction } from '../../models';
import type { EO_User, ResponseGetBody } from '../types';

export async function getUser(nango: NangoAction): Promise<{ me: EO_User; division: number }> {
    // Get the current user
    const getMe = await nango.get<ResponseGetBody<EO_User[]>>({
        endpoint: '/api/v1/current/Me',
        headers: { accept: 'application/json' }
    });
    if (getMe.data.d.results.length <= 0) {
        throw new nango.ActionError({ message: 'failed to get user' });
    }

    const me = getMe.data.d.results[0];
    if (!me) {
        throw new nango.ActionError({ message: 'failed to get user' });
    }

    const division = me.CurrentDivision;
    await nango.log(`Got user ${me.UserID}, division ${division}`);
    return { me, division };
}
