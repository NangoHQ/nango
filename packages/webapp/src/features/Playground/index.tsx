import { Braces, Play, RotateCcw, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { Button, FieldLabel } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';
import { PlaygroundInputs } from './PlaygroundInputs';
import { PlaygroundResultData, PlaygroundResultStatus } from './PlaygroundResult';
import { PlaygroundSelectors } from './PlaygroundSelectors';
import { getInputFields } from './types';
import { usePlayground } from './usePlayground';
import { usePlaygroundFunctions } from './usePlaygroundFunctions';

import type { JSONSchema7 } from 'json-schema';

export const FunctionPlayground: React.FC = () => {
    const env = useStore((s) => s.env);
    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundFunctionName = usePlaygroundStore((s) => s.function);
    const playgroundFunctionType = usePlaygroundStore((s) => s.functionType);
    const result = usePlaygroundStore((s) => s.result);
    const running = usePlaygroundStore((s) => s.running);
    const inputErrors = usePlaygroundStore((s) => s.inputErrors);
    const clearPlaygroundInputError = usePlaygroundStore((s) => s.clearInputError);

    const playgroundFunctions = usePlaygroundFunctions({ env, providerConfigKey: playgroundIntegration || '' });

    const playgroundFunction = useMemo(() => {
        if (!playgroundFunctionName || !playgroundFunctionType) return undefined;
        return playgroundFunctions.rows.find((row) => row.name === playgroundFunctionName && row.type === playgroundFunctionType);
    }, [playgroundFunctions.rows, playgroundFunctionName, playgroundFunctionType]);

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

    const clearInputError = useCallback((name: string) => clearPlaygroundInputError(name), [clearPlaygroundInputError]);

    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const isFunctionDisabled = Boolean(playgroundFunction && playgroundFunction.enabled === false);
    const canRun = Boolean(playgroundIntegration && playgroundConnection && playgroundFunction && playgroundFunctionType) && !isFunctionDisabled;
    const isSync = playgroundFunctionType === 'sync';
    const showInputs = Boolean(playgroundFunction && (isSync || inputFields.length > 0));

    return (
        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-11 text-text-strong">
            <div className="flex flex-col gap-6">
                <PlaygroundSelectors
                    env={env}
                    functions={playgroundFunctions.rows}
                    functionsReady={playgroundFunctions.ready}
                    functionsError={playgroundFunctions.error}
                    onRetryFunctions={playgroundFunctions.retry}
                />

                {showInputs && (
                    <PlaygroundInputs env={env} isSync={isSync} inputFields={inputFields} inputErrors={inputErrors} clearInputError={clearInputError} />
                )}

                <div className="flex gap-2">
                    {running ? (
                        <>
                            <Button variant="primary" disabled loading={true} size="md">
                                Running
                            </Button>
                            {isSync && (
                                <Button variant="danger" size="md" onClick={handleCancel}>
                                    <X />
                                    Cancel run
                                </Button>
                            )}
                        </>
                    ) : (
                        <ConditionalTooltip condition={isFunctionDisabled} content="Enable this function to run it from the Playground.">
                            <Button variant="primary" size="md" onClick={handleRun} disabled={!canRun}>
                                {result ? <RotateCcw /> : <Play />}
                                {result ? 'Run again' : 'Run'}
                            </Button>
                        </ConditionalTooltip>
                    )}
                </div>

                <PlaygroundResultStatus env={env} isSync={isSync} />
            </div>

            <div className="flex min-w-0 flex-col gap-3">
                <FieldLabel>Result</FieldLabel>
                {result ? (
                    <PlaygroundResultData />
                ) : (
                    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-ds-md border border-dashed border-border-default text-body-medium-regular text-text-muted">
                        <Braces className="size-5" />
                        Run a function to see its result here.
                    </div>
                )}
            </div>
        </div>
    );
};
