import { CreateTRPCProxyClient } from '@trpc/client';
import type { AppRouter } from './server.js';
export declare function getRunnerClient(url: string): CreateTRPCProxyClient<AppRouter>;
