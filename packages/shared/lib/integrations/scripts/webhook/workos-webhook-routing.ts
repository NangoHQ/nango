import crypto from 'crypto';
import type { DsyncUserCreatedEvent, DsyncUserUpdatedEvent, DsyncUserDeletedEvent } from '@workos-inc/node';
import WorkOSClient from '../../../clients/workos.client.js';
import accountService from '../../../services/account.service.js';
import userService from '../../../services/user.service.js';
import logger from '../../../logger/console.js';

export default async function route(headers: Record<string, any>, body: any) {
    const valid = validate(headers, body);
    console.log('is valid', valid);

    if (!valid) {
        logger.error('WorkOS webhook signature invalid');
        return;
    }

    const { event, data } = body;

    switch (event) {
        case 'dsync.user.created':
            await createUser(data);
            break;
        case 'dsync.user.updated':
            await updateUser(data);
            break;
        case 'dsync.user.deleted':
            await deleteUser(data);
            break;
    }
}

function validate(headers: Record<string, any>, payload: any): boolean {
    const signature = headers['workos-signature'];
    console.log(signature);
    const [t, v1] = signature.split(',');
    if (typeof t === 'undefined' || typeof v1 === 'undefined') {
        throw new Error('Signature or timestamp missing');
    }
    const { 1: timestamp } = t.split('=');
    const { 1: signatureHash } = v1.split('=');

    if (!timestamp || !signatureHash) {
        throw new Error('Signature or timestamp missing');
    }
    console.log(timestamp);

    const combinedSignature = `${timestamp}.${JSON.stringify(payload)}`;
    console.log(combinedSignature);
    const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');
    console.log('hash');

    const bufferLength = Math.max(Buffer.from(signature, 'hex').length, Buffer.from(createdHash, 'hex').length);
    console.log('bufferLength');
    const signatureBuffer = Buffer.alloc(bufferLength, signature, 'hex');
    console.log('signbug');
    const hashBuffer = Buffer.alloc(bufferLength, createdHash, 'hex');
    console.log('hasbug');

    return crypto.timingSafeEqual(signatureBuffer, hashBuffer);
}

/**
 * Directory sync: Create User
 * @desc Create a user in Nango when a user is created in the directory sync
 * find the organization and create it if it doesn't exist
 */
async function createUser(data: DsyncUserCreatedEvent['data']): Promise<void> {
    if (!WorkOSClient) {
        throw new Error('WorkOS client not configured');
    }
    try {
        const { id, emails, firstName, lastName, organizationId } = data;
        const primaryEmail = emails.find((email) => email.primary)?.value;
        if (organizationId) {
            const organization = await WorkOSClient.organizations.getOrganization(organizationId);
            const account = await accountService.getOrCreateAccount(organization.name, organizationId);
            if (!account) {
                logger.error('Account creation failed');
                return;
            }
            const user = await userService.createUser(primaryEmail as string, `${firstName} ${lastName}`, '', '', account.id, id);
            if (!user) {
                logger.error('User creation failed');
                return;
            }
        }
    } catch (e) {
        logger.error(e);
    }
}

/**
 * Directory sync: Update User
 * @desc Update a user in Nango when a user is updated in the directory sync
 * we only keep track of the email and name
 */
async function updateUser(data: DsyncUserUpdatedEvent['data']): Promise<void> {
    if (!WorkOSClient) {
        throw new Error('WorkOS client not configured');
    }

    try {
        const { id, emails, firstName, lastName } = data;

        const primaryEmail = emails.find((email) => email.primary)?.value;

        const user = await userService.getUserByExternalId(id);

        if (!user) {
            logger.error('User not found');
            return;
        }

        await userService.updateNameAndEmail(user.id, `${firstName} ${lastName}`, primaryEmail as string);
    } catch (e) {
        logger.error(e);
    }
}

async function deleteUser(data: DsyncUserDeletedEvent['data']): Promise<void> {
    if (!WorkOSClient) {
        throw new Error('WorkOS client not configured');
    }

    try {
        const user = await userService.getUserByExternalId(data.id);

        if (!user) {
            logger.error('User not found');
            return;
        }

        await userService.suspendUser(user.id);
    } catch (e) {
        logger.error(e);
    }
}
