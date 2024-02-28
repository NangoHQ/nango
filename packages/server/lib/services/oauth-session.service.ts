import type { OAuthSession } from '@nangohq/shared';
import { db } from '@nangohq/shared';
import { convertJsonKeysToCamelCase, convertJsonKeysToSnakeCase } from '../utils/utils.js';

class OAuthSessionService {
    async create(oAuthSession: OAuthSession) {
        const authSession = convertJsonKeysToSnakeCase<OAuthSession>(oAuthSession);
        await this.queryBuilder().insert({ ...authSession });
    }

    async findById(id: string): Promise<OAuthSession | null> {
        const session = await this.queryBuilder().where({ id }).first();
        return convertJsonKeysToCamelCase<OAuthSession>(session as Record<string, any>);
    }

    async delete(id: string) {
        const session = await this.findById(id);
        if (!session) {
            return;
        }
        await this.queryBuilder().where({ id }).delete();
    }

    /**
     * This will clear the sessions that have been created for more than 24hrs,
     * it's possible that some sessions are created but at the end the callback url
     * was not called hence the sessions still remains.
     * We will use the method to clean such for now its cleans in the last 24hrs
     */
    async clearStaleSessions() {
        const currentTime = new Date().getTime();
        const time24HoursAgo = new Date(currentTime - 24 * 60 * 60 * 1000);
        return this.queryBuilder().where('created_at', '<', time24HoursAgo).delete();
    }

    private queryBuilder() {
        return db.knex.select('*').from<OAuthSession>('_nango_oauth_sessions');
    }
}

export default new OAuthSessionService();
