import { Play, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import { PlaygroundInputs } from './PlaygroundInputs';
import { PlaygroundResult } from './PlaygroundResult';
import { PlaygroundSelectors } from './PlaygroundSelectors';
import { getInputFields } from './types';
import { usePlayground } from './usePlayground';
import { PermissionGate } from '../PermissionGate';
import { Button } from '../ui/button';
import { Sheet, SheetContent } from '../ui/sheet';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useGetIntegrationFlows } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';
import { cn } from '@/utils/utils';

import type { NangoSyncConfig } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export const Playground: React.FC = () => {
    const env = useStore((s) => s.env);
    const playgroundOpen = usePlaygroundStore((s) => s.isOpen);
    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundFunctionName = usePlaygroundStore((s) => s.function);
    const playgroundFunctionType = usePlaygroundStore((s) => s.functionType);
    const result = usePlaygroundStore((s) => s.result);
    const running = usePlaygroundStore((s) => s.running);
    const inputErrors = usePlaygroundStore((s) => s.inputErrors);
    const setPlaygroundOpen = usePlaygroundStore((s) => s.setOpen);
    const clearPlaygroundInputError = usePlaygroundStore((s) => s.clearInputError);

    const location = useLocation();

    useEffect(() => {
        // Auto-close the sheet when the route changes
        if (playgroundOpen) {
            setPlaygroundOpen(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    const queryEnv = playgroundOpen ? env : '';

    const { data: flowsData } = useGetIntegrationFlows(queryEnv, playgroundIntegration || '');

    const allFlows: (NangoSyncConfig & { resolvedType: 'action' | 'sync' })[] = useMemo(() => {
        if (!flowsData) return [];
        return flowsData.data.flows.filter((f) => f.type === 'action' || f.type === 'sync').map((f) => ({ ...f, resolvedType: f.type as 'action' | 'sync' }));
    }, [flowsData]);

    const playgroundFunction = useMemo(() => {
        if (!playgroundFunctionName) return undefined;
        return allFlows.find((f) => f.name === playgroundFunctionName);
    }, [allFlows, playgroundFunctionName]);

    const inputSchema = useMemo((): JSONSchema7 | null => {
        if (!playgroundFunction || !playgroundFunction.json_schema || typeof playgroundFunction.json_schema !== 'object') return null;
        const defKey = playgroundFunction.input;
        const schema =
            (defKey ? (playgroundFunction.json_schema.definitions?.[defKey] as JSONSchema7 | undefined) : undefined) || playgroundFunction.json_schema;
        if (!schema || typeof schema !== 'object') return null;
        const props = schema.properties;
        if (!props || Object.keys(props).length === 0) return null;
        return schema;
    }, [playgroundFunction]);

    const inputFields = useMemo(() => getInputFields(inputSchema), [inputSchema]);

    const { handleRun, handleCancel } = usePlayground(inputFields);

    const { data: envData } = useEnvironment(env);
    const environment = envData?.environmentAndAccount?.environment;
    const { can } = usePermissions();
    const canUsePlayground = envData != null && (can(permissions.canUseProdPlayground) || !environment?.is_production);

    const clearInputError = useCallback((name: string) => clearPlaygroundInputError(name), [clearPlaygroundInputError]);

    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const canRun = Boolean(playgroundIntegration && playgroundConnection && playgroundFunctionName && playgroundFunctionType);
    const isSync = playgroundFunctionType === 'sync';
    const showInputs = Boolean(playgroundFunction && (isSync || inputFields.length > 0));

    return (
        <>
            {/* Custom overlay — click to close, pointer-events-none so it never blocks the page */}
            <div
                className={cn(
                    'fixed inset-0 z-50 bg-black/30 transition-opacity duration-300 ease-in-out',
                    playgroundOpen ? 'opacity-100' : 'opacity-0 pointer-events-none invisible'
                )}
                onClick={() => setPlaygroundOpen(false)}
            />
            <Sheet open={playgroundOpen} onOpenChange={setPlaygroundOpen} modal={false}>
                <SheetContent
                    side="right"
                    overlayClassName="hidden"
                    insetTop={88}
                    insetBottom={24}
                    insetRight={24}
                    onInteractOutside={(e) => e.preventDefault()}
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onFocusOutside={(e) => e.preventDefault()}
                    className={cn(
                        'text-text-primary rounded-lg border border-border-muted shadow-lg p-6',
                        'flex flex-col items-start gap-2.5',
                        'w-[537px] max-w-none sm:max-w-none',
                        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
                        '[&>button]:hidden'
                    )}
                >
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-8">
                            {/* Header */}
                            <div className="flex w-full items-start justify-between">
                                <div className="min-w-0 flex flex-col gap-2">
                                    <h2 className="text-text-primary text-heading-medium">Playground</h2>
                                    <p className="text-body-medium-regular text-text-secondary">Quickly run any function.</p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setPlaygroundOpen(false)} aria-label="Close playground">
                                    <X />
                                </Button>
                            </div>

                            {/* Content */}
                            <div className="flex w-full flex-col gap-6">
                                <PlaygroundSelectors env={env} queryEnv={queryEnv} />

                                {showInputs && (
                                    <PlaygroundInputs
                                        env={env}
                                        queryEnv={queryEnv}
                                        isSync={isSync}
                                        inputFields={inputFields}
                                        inputErrors={inputErrors}
                                        clearInputError={clearInputError}
                                    />
                                )}

                                {/* Run controls */}
                                <div className="flex gap-2">
                                    {running ? (
                                        <>
                                            <Button variant="primary" disabled loading={true} size="sm">
                                                Running
                                            </Button>
                                            {isSync && (
                                                <Button variant="destructive" size="sm" onClick={handleCancel}>
                                                    <X />
                                                    Cancel run
                                                </Button>
                                            )}
                                        </>
                                    ) : result ? (
                                        <PermissionGate condition={canUsePlayground} message="Your role does not have permission to use the playground.">
                                            {(allowed) => (
                                                <Button variant="primary" size="sm" onClick={handleRun} disabled={!canRun || !allowed}>
                                                    <RotateCcw />
                                                    Run again
                                                </Button>
                                            )}
                                        </PermissionGate>
                                    ) : (
                                        <PermissionGate condition={canUsePlayground} message="Your role does not have permission to use the playground.">
                                            {(allowed) => (
                                                <Button variant="primary" size="sm" onClick={handleRun} disabled={!canRun || !allowed}>
                                                    <Play />
                                                    Run
                                                </Button>
                                            )}
                                        </PermissionGate>
                                    )}
                                </div>
                            </div>
                        </div>
                        <PlaygroundResult env={env} isSync={isSync} />
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
};
