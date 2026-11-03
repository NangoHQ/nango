import type { CLIDeployFlowConfig, FunctionReconciliationScope, OnEventScriptsByProvider } from '@nangohq/types';

export type LegacyDeployScope = FunctionReconciliationScope | { kind: 'single' } | { kind: 'none' };

export function resolveLegacyDeployScope({
    deployMode,
    reconciliationScope,
    flows
}: {
    deployMode: 'all' | 'single' | 'integration';
    reconciliationScope?: FunctionReconciliationScope | undefined;
    flows: Pick<CLIDeployFlowConfig, 'providerConfigKey'>[];
}): LegacyDeployScope {
    if (reconciliationScope) {
        return reconciliationScope;
    }
    if (deployMode === 'single') {
        return { kind: 'single' };
    }
    const [firstFlow] = flows;
    if (!firstFlow) {
        return { kind: 'none' };
    }
    return deployMode === 'integration' ? { kind: 'integration', integrationId: firstFlow.providerConfigKey } : { kind: 'environment' };
}

export function onEventScopeProviderKeys(
    scope: LegacyDeployScope,
    onEventScriptsByProvider: Pick<OnEventScriptsByProvider, 'providerConfigKey'>[]
): string[] | 'all' {
    if (scope.kind === 'environment') {
        return 'all';
    }
    const payloadKeys = onEventScriptsByProvider.map(({ providerConfigKey }) => providerConfigKey);
    return [...new Set(scope.kind === 'integration' ? [scope.integrationId, ...payloadKeys] : payloadKeys)];
}
