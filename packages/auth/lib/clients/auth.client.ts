import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import express from 'express';
import session from 'express-session';
import SQLiteStore from 'connect-sqlite3';
import path from 'path';
import { dirname } from '../utils/utils.js';
import crypto from 'crypto';
import userService from '../services/user.service.js';
import util from 'util';
import cookieParser from 'cookie-parser';

const sessionStore = SQLiteStore(session);

declare global {
    namespace Express {
        interface User {
            email: string;
            name: string;
            id: number;
        }
    }
}

export class AuthClient {
    static setup(app: express.Express) {
        app.use(cookieParser());
        app.use(express.static(path.join(dirname(), 'public')));

        app.use(
            session({
                secret: 'nango',
                resave: false,
                saveUninitialized: false,
                store: new sessionStore({ db: 'sessions.sqlite3', dir: path.join(dirname(), './../..') }) as session.Store,
                name: 'nango_session'
            })
        );

        app.use(passport.initialize());
        app.use(passport.session());

        passport.use(
            new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, async function (
                email: string,
                password: string,
                cb: (error: any, user?: Express.User | false, options?: any) => void
            ) {
                let user = await userService.getUserByEmail(email);

                if (user == null) {
                    return cb(null, false, { message: 'Incorrect email or password.' });
                }

                let hashedPassword = await util.promisify(crypto.pbkdf2)(password, user.salt, 310000, 32, 'sha256');

                if (!crypto.timingSafeEqual(Buffer.from(user.hashed_password, 'base64'), hashedPassword)) {
                    return cb(null, false, { message: 'Incorrect email or password.' });
                }

                return cb(null, user);
            })
        );

        passport.serializeUser(function (user: Express.User, cb) {
            process.nextTick(function () {
                cb(null, { id: user.id, email: user.email, name: user.name });
            });
        });

        passport.deserializeUser(function (user: Express.User, cb) {
            process.nextTick(function () {
                return cb(null, user);
            });
        });
    }
}
