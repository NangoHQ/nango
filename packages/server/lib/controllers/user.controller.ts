import { getUserFromSession } from '../utils/utils.js';
import type { Request, Response, NextFunction } from 'express';
import { errorManager, userService } from '@nangohq/shared';

class UserController {
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
