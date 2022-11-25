import type { Request, Response } from 'express';
import connectionService from '../services/connection.service.js';

class ConnectionController {
    async getConnectionCredentials(req: Request, res: Response) {
        let connectionId = req.query['connection_id'] as string;
        let integrationKey = req.params['integration_key'] as string;

        if (connectionId == null) {
            res.status(400).send({ error: `Missing param connection_id.` });
            return;
        }

        if (integrationKey == null) {
            res.status(400).send({ error: `Missing param integration_key.` });
            return;
        }

        let connection = await connectionService.getConnection(connectionId, integrationKey);

        if (connection == null) {
            res.status(400).send({ error: `There is no matching connection for connection_id: ${connectionId} and integration_key: ${integrationKey}` });
            return;
        }

        res.status(200).send({ connection: connection });
    }
}

export default new ConnectionController();
