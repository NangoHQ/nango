import './tracer.js';
import './utils/config.js';

import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import http from 'http';
import { getGlobalOAuthCallbackUrl, getPort, getWebsocketsPath, packageJsonFile, environmentService } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';
import oAuthSessionService from './services/oauth-session.service.js';
import migrate from './utils/migrate.js';
import { migrate as migrateRecords } from '@nangohq/records';
import { start as migrateLogs } from '@nangohq/logs';

import publisher from './clients/publisher.client.js';
import { app } from './routes.js';

const { NANGO_MIGRATE_AT_START = 'true' } = process.env;
const logger = getLogger('Server');

const server = http.createServer(app);

// -------
// Websocket
const wss = new WebSocketServer({ server, path: getWebsocketsPath() });

wss.on('connection', async (ws: WebSocket) => {
    await publisher.subscribe(ws);
});

// Set to 'false' to disable migration at startup. Appropriate when you
// have multiple replicas of the service running and you do not want them
// all trying to migrate the database at the same time. In this case, the
// operator should run migrate.ts once before starting the service.
if (NANGO_MIGRATE_AT_START === 'true') {
    await migrate();
    await migrateLogs();
    await migrateRecords();
} else {
    logger.info('Not migrating database');
}

await environmentService.cacheSecrets();
await oAuthSessionService.clearStaleSessions();

const port = getPort();
server.listen(port, () => {
    logger.info(`✅ Nango Server with version ${packageJsonFile().version} is listening on port ${port}. OAuth callback URL: ${getGlobalOAuthCallbackUrl()}`);
    logger.info(
        `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch Nango at http://localhost:${port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`
    );
});
