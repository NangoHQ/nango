import { useCallback, useRef } from 'react';

import { useEnvironment } from '@/hooks/useEnvironment';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';

import type { InputField } from './types';

export function usePlaygroundDryRun(inputFields: InputField[]) {
    const env = useStore((s) => s.env);
    const baseUrl = useStore((s) => s.baseUrl);
    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const playgroundFunction = usePlaygroundStore((s) => s.function);
    const playgroundFunctionType = usePlaygroundStore((s) => s.functionType);
    const inputValues = usePlaygroundStore((s) => s.inputValues);
    const editorCode = usePlaygroundStore((s) => s.editorCode);
    const setEditorDryRunning = usePlaygroundStore((s) => s.setEditorDryRunning);
    const appendConsoleOutput = usePlaygroundStore((s) => s.appendConsoleOutput);
    const clearConsoleOutput = usePlaygroundStore((s) => s.clearConsoleOutput);
    const setPlaygroundInputErrors = usePlaygroundStore((s) => s.setInputErrors);

    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;

    const abortRef = useRef<AbortController | null>(null);

    const handleDryRun = useCallback(async () => {
        if (!playgroundIntegration || !playgroundConnection || !playgroundFunction || !playgroundFunctionType || !environmentAndAccount || !editorCode) return;

        const secretKey = environmentAndAccount.environment.secret_key;
        const controller = new AbortController();
        abortRef.current = controller;
        setEditorDryRunning(true);
        clearConsoleOutput();
        setPlaygroundInputErrors({});

        appendConsoleOutput('⏳ Compiling...');

        try {
            let parsedInput: Record<string, unknown> | undefined;
            if (playgroundFunctionType === 'action' && inputFields.length > 0) {
                parsedInput = {};
                const errors: Record<string, string> = {};
                for (const field of inputFields) {
                    const raw = inputValues[field.name] ?? '';
                    const trimmed = raw.trim();
                    if (!trimmed) {
                        if (field.required) errors[field.name] = 'Required';
                        continue;
                    }
                    try {
                        switch (field.type) {
                            case 'number': {
                                const n = Number(trimmed);
                                if (!Number.isFinite(n)) throw new Error('Expected a number');
                                parsedInput[field.name] = n;
                                break;
                            }
                            case 'integer': {
                                const n = Number(trimmed);
                                if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error('Expected an integer');
                                parsedInput[field.name] = n;
                                break;
                            }
                            case 'boolean': {
                                const v = trimmed.toLowerCase();
                                if (v !== 'true' && v !== 'false') throw new Error('Expected true or false');
                                parsedInput[field.name] = v === 'true';
                                break;
                            }
                            case 'object': {
                                const parsed = JSON.parse(trimmed);
                                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object');
                                parsedInput[field.name] = parsed;
                                break;
                            }
                            case 'array': {
                                const parsed = JSON.parse(trimmed);
                                if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
                                parsedInput[field.name] = parsed;
                                break;
                            }
                            default:
                                parsedInput[field.name] = raw;
                        }
                    } catch (err) {
                        errors[field.name] = err instanceof Error ? err.message : 'Invalid value';
                    }
                }
                if (Object.keys(errors).length > 0) {
                    setPlaygroundInputErrors(errors);
                    appendConsoleOutput('❌ Invalid input');
                    setEditorDryRunning(false);
                    return;
                }
            }

            const response = await fetch(`${baseUrl}/sf-dryrun`, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    Authorization: `Bearer ${secretKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    integration_id: playgroundIntegration,
                    function_name: playgroundFunction,
                    function_type: playgroundFunctionType,
                    code: editorCode,
                    connection_id: playgroundConnection,
                    environment: environmentAndAccount.environment.name,
                    ...(parsedInput ? { input: parsedInput } : {})
                })
            });

            const result = await response.json();

            if (!response.ok) {
                const errMsg = result?.error?.message || result?.error?.step || 'Unknown error';
                const step = result?.error?.step || 'unknown';
                appendConsoleOutput(`❌ ${step}: ${errMsg}`);
                if (result?.error?.stack) {
                    appendConsoleOutput(result.error.stack);
                }
                if (result?.error?.payload) {
                    appendConsoleOutput(JSON.stringify(result.error.payload, null, 2));
                }
            } else {
                appendConsoleOutput('✅ Execution completed');

                if (result.function_type === 'action') {
                    if (result.logs?.length > 0) {
                        appendConsoleOutput('\n📝 Logs:');
                        for (const entry of result.logs) {
                            const log = entry as { level?: string; message?: unknown; payload?: unknown };
                            const level = log.level ?? 'info';
                            const prefix = level === 'error' ? '  ❌' : level === 'warn' ? '  ⚠️' : '  ℹ️';
                            const msg = typeof log.message === 'string' ? log.message : JSON.stringify(log.message);
                            appendConsoleOutput(log.payload !== undefined ? `${prefix} ${msg} ${JSON.stringify(log.payload)}` : `${prefix} ${msg}`);
                        }
                    }
                    appendConsoleOutput('\n📤 Output:');
                    appendConsoleOutput(JSON.stringify(result.output, null, 2));
                } else {
                    const changes = result.changes;
                    if (changes?.logs?.length > 0) {
                        appendConsoleOutput('\n📝 Logs:');
                        for (const entry of changes.logs) {
                            if (typeof entry === 'string') {
                                appendConsoleOutput(`  ℹ️ ${entry}`);
                            } else {
                                appendConsoleOutput(`  ℹ️ ${JSON.stringify(entry)}`);
                            }
                        }
                    }
                    appendConsoleOutput('\n📊 Changes:');
                    appendConsoleOutput(
                        `  Added: ${changes?.counts?.added ?? 0}, Updated: ${changes?.counts?.updated ?? 0}, Deleted: ${changes?.counts?.deleted ?? 0}`
                    );
                    if (changes?.batchSave && Object.keys(changes.batchSave).length > 0) {
                        appendConsoleOutput('\nSaved records:');
                        appendConsoleOutput(JSON.stringify(changes.batchSave, null, 2));
                    }
                }

                if (result.proxy_calls?.length > 0) {
                    appendConsoleOutput(`\n🌐 Proxy calls (${result.proxy_calls.length}):`);
                    for (const call of result.proxy_calls) {
                        appendConsoleOutput(`  ${call.method} ${call.endpoint} → ${call.status}`);
                    }
                }
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                appendConsoleOutput('⚠️ Cancelled');
            } else {
                appendConsoleOutput(`❌ ${err instanceof Error ? err.message : 'Network error'}`);
            }
        } finally {
            setEditorDryRunning(false);
            abortRef.current = null;
        }
    }, [
        playgroundIntegration,
        playgroundConnection,
        playgroundFunction,
        playgroundFunctionType,
        environmentAndAccount,
        editorCode,
        baseUrl,
        inputFields,
        inputValues,
        setEditorDryRunning,
        appendConsoleOutput,
        clearConsoleOutput,
        setPlaygroundInputErrors
    ]);

    const handleDeploy = useCallback(async () => {
        if (!playgroundIntegration || !playgroundFunction || !playgroundFunctionType || !environmentAndAccount || !editorCode) return;

        const secretKey = environmentAndAccount.environment.secret_key;
        const setEditorDeploying = usePlaygroundStore.getState().setEditorDeploying;
        const appendOutput = usePlaygroundStore.getState().appendConsoleOutput;

        setEditorDeploying(true);
        appendOutput('\n🚀 Deploying...');

        try {
            const response = await fetch(`${baseUrl}/sf-deploy`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${secretKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    integration_id: playgroundIntegration,
                    function_name: playgroundFunction,
                    function_type: playgroundFunctionType,
                    code: editorCode,
                    environment: environmentAndAccount.environment.name
                })
            });

            const result = await response.json();

            if (!response.ok) {
                const errMsg = result?.error?.message || result?.error?.step || 'Unknown error';
                const step = result?.error?.step || 'unknown';
                appendOutput(`❌ Deploy ${step}: ${errMsg}`);
                if (result?.error?.stack) {
                    appendOutput(result.error.stack);
                }
            } else {
                appendOutput('✅ Deployed successfully');
                // Update original code so dirty detection resets
                usePlaygroundStore.getState().setEditorOriginalCode(editorCode);
            }
        } catch (err: unknown) {
            appendOutput(`❌ ${err instanceof Error ? err.message : 'Network error'}`);
        } finally {
            setEditorDeploying(false);
        }
    }, [playgroundIntegration, playgroundFunction, playgroundFunctionType, environmentAndAccount, editorCode, baseUrl]);

    const handleCancelDryRun = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    return { handleDryRun, handleDeploy, handleCancelDryRun };
}
