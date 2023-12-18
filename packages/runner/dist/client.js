import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
export function getRunnerClient(url) {
    return createTRPCProxyClient({
        links: [httpBatchLink({ url })]
    });
}
//# sourceMappingURL=client.js.map