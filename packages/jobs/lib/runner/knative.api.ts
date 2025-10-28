import { Kubernetes } from './kubernetes.api.js';

import type { Node } from '@nangohq/fleet';
import type { Result } from '@nangohq/types';

export class Knative extends Kubernetes {
    private static kninstance: Knative | null = null;

    static override getInstance(): Knative {
        if (!Knative.kninstance) {
            Knative.kninstance = new Knative();
        }
        return Knative.kninstance;
    }

    override async createNode(node: Node): Promise<Result<void>> {
        // const name = this.getServiceName(node);
        const namespace = this.getNamespace(node);
        // const runnerUrl = this.getRunnerUrl(node);

        // Ensure namespace exists if using per-runner namespaces
        if (this.namespacePerRunner) {
            const namespaceResult = await this.ensureNamespace(namespace);
            if (namespaceResult.isErr()) {
                return namespaceResult;
            }
        }
        return super.createNode(node);
    }
}
