import { expect, describe, it } from 'vitest';
import connectionService from './connection.service'; // adjust path if necessary
import type { OAuth2Credentials } from '../models';

describe('Connection service tests', () => {
    describe('parseRawCredentials', () => {
        it('should extract access_token from authed_user for Slack user token authentication', () => {
            const rawCredentials = {
                authed_user: {
                    access_token: 'user_access_token',
                    scope: 'channels:history,channels:read,channels:write,channels:write.topic,chat:write',
                    token_type: 'user',
                    id: 'user_id'
                },
                team: {
                    id: 'team_id',
                    name: 'Test'
                },
                ok: true,
                app_id: 'app_id'
            };

            const credentials = connectionService.parseRawCredentials(rawCredentials, 'OAUTH2') as OAuth2Credentials;

            expect(credentials).toBeDefined();
            expect(credentials.type).toEqual('OAUTH2');
            expect(credentials.access_token).toEqual('user_access_token');
        });
    });
});
