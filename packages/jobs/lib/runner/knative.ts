import { Knative } from './knative.api.js';

import type { Node, NodeProvider } from '@nangohq/fleet';

export const knativeNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000
    },
    start: async (node: Node) => {
        const knative = Knative.getInstance();
        return knative.createNode(node);
    },
    terminate: async (node: Node) => {
        const knative = Knative.getInstance();
        return knative.deleteNode(node);
    },
    verifyUrl: (url: string) => {
        const knative = Knative.getInstance();
        return knative.verifyUrl(url);
    }
};
