import type { Request, Response, NextFunction } from 'express';
import { accountService, userService } from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';

class AccountController {
    async getAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const { account } = await getUserAccountAndEnvironmentFromSession(req);
            const users = await userService.getUsersByAccountId(account.id);
            const invitedUsers = await userService.getInvitedUsersByAccountId(account.id);

            res.status(200).send({ account, users, invitedUsers });
        } catch (err) {
            next(err);
        }
    }

    async editAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const { account } = await getUserAccountAndEnvironmentFromSession(req);

            const name = req.body['name'];

            if (!name) {
                res.status(400).send({ error: 'Account name cannot be empty.' });
                return;
            }

            await accountService.editAccount(name, account.id);
            res.status(200).send({ name });
        } catch (err) {
            next(err);
        }
    }
}

export default new AccountController();
