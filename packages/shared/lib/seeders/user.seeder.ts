import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { nanoid } from '@nangohq/utils';
import type { User } from '../models';
import userService from '../services/user.service.js';

const promisePdkdf2 = promisify(crypto.pbkdf2);
export async function seedUser(accountId: number): Promise<User> {
    const uniqueId = nanoid();

    const salt = crypto.randomBytes(16).toString('base64');
    const hashedPassword = (await promisePdkdf2(uniqueId, salt, 310000, 32, 'sha256')).toString('base64');

    const user = await userService.createUser(`${uniqueId}@example.com`, uniqueId, hashedPassword, salt, accountId);
    if (!user) {
        throw new Error('Failed to create user');
    }
    return user;
}
