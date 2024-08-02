import type { Request, Response, NextFunction } from 'express';

class AuthController {
    logout(req: Request, res: Response<any, never>, next: NextFunction) {
        try {
            req.session.destroy((err) => {
                if (err) {
                    next(err);
                }

                res.status(200).send();
            });
        } catch (err) {
            next(err);
        }
    }
}

export default new AuthController();
