/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

// Import environment variables (if running server locally).
import * as dotenv from 'dotenv';
if (process.env['SERVER_RUN_MODE'] !== 'DOCKERIZED') {
    dotenv.config({ path: '../../.env' });
}

import { authServer, getOauthCallbackUrl, getPort } from '@nangohq/auth';

let port = getPort();

let server = await authServer.setup();

let callbackUrl = await getOauthCallbackUrl();

server.listen(port, () => {
    console.log(`✅ Nango Server is listening on port ${port}. OAuth callback URL: ${callbackUrl}`);
});
