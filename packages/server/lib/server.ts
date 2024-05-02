import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import http from 'http';
import { getGlobalOAuthCallbackUrl, getPort, getWebsocketsPath, packageJsonFile } from '@nangohq/shared';

import publisher from './clients/publisher.client.js';
import { app } from './routers.js';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('Server');

const server = http.createServer(app);

// -------
// Websocket
const wss = new WebSocketServer({ server, path: getWebsocketsPath() });

wss.on('connection', async (ws: WebSocket) => {
    await publisher.subscribe(ws);
});

const port = getPort();
server.listen(port, () => {
    logger.info(`✅ Nango Server with version ${packageJsonFile().version} is listening on port ${port}. OAuth callback URL: ${getGlobalOAuthCallbackUrl()}`);
    logger.info(
        `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch Nango at http://localhost:${port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`
    );
});
