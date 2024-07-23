import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { BasicStrategy } from 'passport-http';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { flagHasAuth, isBasicAuthEnabled } from '@nangohq/utils';
import { database } from '@nangohq/database';
import { dirname, userService } from '@nangohq/shared';
import crypto from 'crypto';
import util from 'util';
import cookieParser from 'cookie-parser';
import connectSessionKnex from 'connect-session-knex';

const KnexSessionStore = connectSessionKnex(session);

const sessionStore = new KnexSessionStore({
    knex: database.knex,
    tablename: '_nango_sessions',
    sidfieldname: 'sid'
});

export function setupAuth(app: express.Router) {
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
            cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, secure: false },
            rolling: true
        })
    );

    app.use(passport.initialize());
    app.use(passport.session());

    if (flagHasAuth) {
        passport.use(
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, async function (
                email: string,
                password: string,
                cb: (error: any, user?: Express.User | false, options?: any) => void
            ) {
                if (!email) {
                    cb(null, false, { message: 'Email is required.' });
                    return;
                }
                // in the case of SSO, the password field is empty. Explicitly
                // check for this case to avoid a database query.
                if (!password) {
                    cb(null, false, { message: 'Password is required.' });
                    return;
                }

                const user = await userService.getUserByEmail(email);
                if (!user) {
                    cb(null, false, { message: 'Incorrect email or password.' });
                    return;
                }

                const proposedHashedPassword = await util.promisify(crypto.pbkdf2)(password, user.salt, 310000, 32, 'sha256');
                const actualHashedPassword = Buffer.from(user.hashed_password, 'base64');

                if (proposedHashedPassword.length !== actualHashedPassword.length || !crypto.timingSafeEqual(actualHashedPassword, proposedHashedPassword)) {
                    cb(null, false, { message: 'Incorrect email or password.' });
                    return;
                }

                cb(null, user);
            })
        );
    } else {
        passport.use(
            new BasicStrategy(async function (username, password, done) {
                const user = await userService.getUserById(0);

                if (!isBasicAuthEnabled) {
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

    passport.serializeUser(function (user: any, cb) {
        process.nextTick(function () {
            cb(null, { id: user.id, email: user.email, name: user.name, account_id: user.account_id } as Express.User);
        });
    });

    passport.deserializeUser(function (user: Express.User, cb) {
        process.nextTick(function () {
            return cb(null, user);
        });
    });
}
