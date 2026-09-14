import db from '@nangohq/database';

export async function oauthSubjectExists(subjectId: string): Promise<boolean> {
    const id = Number(subjectId);
    if (!Number.isSafeInteger(id) || id <= 0 || subjectId !== String(id)) {
        return false;
    }
    const user = await db
        .knex('_nango_users as users')
        .innerJoin('_nango_accounts as accounts', 'accounts.id', 'users.account_id')
        .where({ 'users.id': id, 'users.suspended': false })
        .first<{ id: number }>('users.id');
    return user !== undefined;
}
