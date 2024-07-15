import { getUserFromSession } from '../utils/utils.js';
import type { Request, Response, NextFunction } from 'express';
import { errorManager, userService } from '@nangohq/shared';

export interface GetUser {
    user: {
        id: number;
        accountId: number;
        email: string;
        name: string;
    };
}

class UserController {
    async getUser(req: Request, res: Response<GetUser, never>, next: NextFunction) {
        try {
            const getUser = await getUserFromSession(req);
            if (getUser.isErr()) {
                errorManager.errResFromNangoErr(res, getUser.error);
                return;
            }

            const user = getUser.value;
            res.status(200).send({
                user: {
                    id: user.id,
                    accountId: user.account_id,
                    email: user.email,
                    name: user.name
                }
            });
        } catch (err) {
            next(err);
        }
    }

    async editName(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            const getUser = await getUserFromSession(req);
            if (getUser.isErr()) {
                errorManager.errResFromNangoErr(res, getUser.error);
                return;
            }

            const user = getUser.value;
            const name = req.body['name'];

            if (!name) {
                res.status(400).send({ error: 'User name cannot be empty.' });
                return;
            }

            await userService.editUserName(name, user.id);
            res.status(200).send({ name });
        } catch (err) {
            next(err);
        }
    }

    async editPassword(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            const getUser = await getUserFromSession(req);
            if (getUser.isErr()) {
                errorManager.errResFromNangoErr(res, getUser.error);
                return;
            }

            const user = getUser.value;
            const oldPassword = req.body['old_password'];
            const newPassword = req.body['new_password'];

            if (!oldPassword || !newPassword) {
                res.status(400).send({ error: 'Old password and new password cannot be empty.' });
                return;
            }

            await userService.changePassword(oldPassword, newPassword, user.id);
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async suspend(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            const userId = req.params['userId'];

            await userService.suspendUser(Number(userId));
            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new UserController();
