import { getLogger } from '@nangohq/utils';

import { Kubernetes } from './kubernetes.api.js';

import type { Node, NodeProvider } from '@nangohq/fleet';

export const logger = getLogger('Kubernetes');

export const kubernetesNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000
    },
    start: async (node: Node) => {
        const kubernetes = Kubernetes.getInstance();
        return kubernetes.createNode(node);
    },
    terminate: async (node: Node) => {
        const kubernetes = Kubernetes.getInstance();
        return kubernetes.deleteNode(node);
    },
    verifyUrl: (url: string) => {
        const kubernetes = Kubernetes.getInstance();
        return kubernetes.verifyUrl(url);
    }
};
