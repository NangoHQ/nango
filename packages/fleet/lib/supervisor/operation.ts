import type { Node } from '../types.js';
import type { Deployment, NodeConfig } from '@nangohq/types';

export type Operation =
    | { type: 'CREATE'; routingId: Node['routingId']; deployment: Deployment; nodeConfig?: NodeConfig | undefined }
    | { type: 'START'; node: Node }
    | { type: 'FAIL'; node: Node; reason: 'starting_timeout_reached' | 'pending_timeout_reached' | 'idle_timeout_reached' }
    | { type: 'OUTDATE'; node: Node }
    | { type: 'FINISHING'; node: Node }
    | { type: 'FINISHING_TIMEOUT'; node: Node }
    | { type: 'TERMINATE'; node: Node }
    | { type: 'REMOVE'; node: Node };

export const Operation = {
    asSpanTags: (o: Operation): Record<string, string | number> => {
        switch (o.type) {
            case 'CREATE':
                return {
                    operation: o.type,
                    routingId: o.routingId,
                    deploymentId: o.deployment.id
                };
            case 'FAIL':
                return {
                    operation: o.type,
                    nodeId: o.node.id,
                    reason: o.reason
                };
            case 'START':
                return {
                    operation: o.type,
                    nodeId: o.node.id
                };
            case 'OUTDATE':
            case 'FINISHING':
            case 'FINISHING_TIMEOUT':
            case 'TERMINATE':
            case 'REMOVE':
                return {
                    operation: o.type,
                    nodeId: o.node.id
                };
        }
    }
};
