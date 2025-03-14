import type { OAuthSession } from '@nangohq/shared';
import db from '@nangohq/database';
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
     * This will clear the sessions that have been created for more than "olderThan"
     * it's possible that some sessions are created but at the end the callback url
     * was not called hence the sessions still remains.
     */
    async deleteExpiredSessions({ limit, olderThan }: { limit: number; olderThan: number }): Promise<number> {
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - olderThan);

        return await db.knex
            .from<OAuthSession>('_nango_oauth_sessions')
            .whereIn('id', function (sub) {
                sub.select('id').from<OAuthSession>('_nango_oauth_sessions').where('created_at', '<=', dateThreshold.toISOString()).limit(limit);
            })
            .delete();
    }

    private queryBuilder() {
        return db.knex.select('*').from<OAuthSession>('_nango_oauth_sessions');
    }
}

export default new OAuthSessionService();
