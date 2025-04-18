import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { nanoid } from '@nangohq/utils';
import userService from '../services/user.service.js';
import type { DBUser } from '@nangohq/types';

const promisePdkdf2 = promisify(crypto.pbkdf2);
export async function seedUser(accountId: number): Promise<DBUser> {
    const uniqueId = nanoid();

    const salt = crypto.randomBytes(16).toString('base64');
    const hashedPassword = (await promisePdkdf2(uniqueId, salt, 310000, 32, 'sha256')).toString('base64');

    const user = await userService.createUser({
        email: `${uniqueId}@example.com`,
        name: uniqueId,
        hashed_password: hashedPassword,
        salt,
        account_id: accountId,
        email_verified: false
    });
    if (!user) {
        throw new Error('Failed to create user');
    }
    return user;
}
