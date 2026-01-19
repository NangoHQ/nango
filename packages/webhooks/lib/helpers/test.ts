import http from 'http';

/**
 * A simple HTTP server for testing webhook delivery.
 * The server responds with 200 OK to all requests.
 */
export class TestWebhookServer {
    private server: http.Server | null = null;
    public readonly primaryUrl: string;
    public readonly secondaryUrl: string;

    constructor(private readonly port: number) {
        this.primaryUrl = `http://localhost:${port}/webhook`;
        this.secondaryUrl = `http://localhost:${port}/webhook-secondary`;
    }

    async start(): Promise<void> {
        this.server = http.createServer((_, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });

        await new Promise<void>((resolve) => {
            this.server!.listen(this.port, () => resolve());
        });
    }

    async stop(): Promise<void> {
        if (!this.server) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            this.server!.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}
