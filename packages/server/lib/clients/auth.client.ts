import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { BasicStrategy } from 'passport-http';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { dirname, isCloud, isBasicAuthEnabled, userService } from '@nangohq/shared';
import crypto from 'crypto';
import util from 'util';
import cookieParser from 'cookie-parser';
import connectSessionKnex from 'connect-session-knex';
import { database } from '@nangohq/shared';
declare global {
    namespace Express {
        interface User {
            email: string;
            name: string;
            id: number;
        }
    }
}

const KnexSessionStore = connectSessionKnex(session);

const sessionStore = new KnexSessionStore({
    knex: database.knex,
    tablename: '_nango_sessions',
    sidfieldname: 'sid'
});

export class AuthClient {
    static setup(app: express.Express) {
        app.use(cookieParser());
        app.use(express.static(path.join(dirname(), 'public')));

        app.use(
            session({
                secret: process.env['NANGO_ADMIN_KEY'] || 'nango',
                resave: false,
                saveUninitialized: false,
                store: sessionStore,
                name: 'nango_session',
                unset: 'destroy',
                cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, secure: false },
                rolling: true
            })
        );

        app.use(passport.initialize());
        app.use(passport.session());

        if (isCloud()) {
            passport.use(
                new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, async function (
                    email: string,
                    password: string,
                    cb: (error: any, user?: Express.User | false, options?: any) => void
                ) {
                    const user = await userService.getUserByEmail(email);

                    if (user == null) {
                        return cb(null, false, { message: 'Incorrect email or password.' });
                    }

                    const proposedHashedPassword = await util.promisify(crypto.pbkdf2)(password, user.salt, 310000, 32, 'sha256');
                    const actualHashedPassword = Buffer.from(user.hashed_password, 'base64');

                    if (
                        proposedHashedPassword.length !== actualHashedPassword.length ||
                        !crypto.timingSafeEqual(actualHashedPassword, proposedHashedPassword)
                    ) {
                        return cb(null, false, { message: 'Incorrect email or password.' });
                    }

                    return cb(null, user);
                })
            );
        } else {
            passport.use(
                new BasicStrategy(async function (username, password, done) {
                    const user = await userService.getUserById(0);

                    if (!isBasicAuthEnabled()) {
                        return done(null, user);
                    }

                    if (username !== process.env['NANGO_DASHBOARD_USERNAME']) {
                        return done(null, false);
                    }

                    if (password !== process.env['NANGO_DASHBOARD_PASSWORD']) {
                        return done(null, false);
                    }

                    if (!user) {
                        return done(null, false);
                    }

                    return done(null, user);
                })
            );
        }

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
