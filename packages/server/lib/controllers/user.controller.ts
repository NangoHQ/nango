import { getUserAndAccountFromSesstion } from '../utils/utils.js';
import type { Request, Response, NextFunction } from 'express';

class UserController {
    async getUser(req: Request, res: Response, next: NextFunction) {
        try {
            let user = (await getUserAndAccountFromSesstion(req)).user;

            res.status(200).send({
                user: {
                    id: user.id,
                    accountId: user.account_id
                }
            });
        } catch (err) {
            next(err);
        }
    }
}

export default new UserController();
