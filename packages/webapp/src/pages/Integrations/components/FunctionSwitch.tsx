import { Loader2 } from 'lucide-react';

import { useEnvironment } from '../../../hooks/useEnvironment.js';
import { useFlowDisable, useFlowEnable, usePreBuiltDeployFlow } from '../../../hooks/useFlow.js';
import { useToast } from '../../../hooks/useToast.js';
import { useStore } from '../../../store.js';
import { APIError } from '../../../utils/api.js';
import { Switch } from '@/components-v2/ui/switch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

import type { ApiError, ApiIntegration, NangoSyncConfig } from '@nangohq/types';

export const FunctionSwitch: React.FC<{
    flow: NangoSyncConfig;
    integration: ApiIntegration;
}> = ({ flow, integration }) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { plan, mutate: mutateEnv } = useEnvironment(env);
    const { confirm, DialogComponent } = useConfirmDialog();

    const { mutateAsync: enableFlow, isPending: isEnablePending } = useFlowEnable(env, integration.unique_key);
    const { mutateAsync: deployFlow, isPending: isDeployPending } = usePreBuiltDeployFlow(env, integration.unique_key);
    const { mutateAsync: disableFlow, isPending: isDisablePending } = useFlowDisable(env, integration.unique_key);

    const loading = isEnablePending || isDeployPending || isDisablePending;

    const toggleSync = () => {
        if (flow.type === 'action') {
            if (flow.enabled) {
                void onDisable();
            } else {
                void onEnable();
            }

            return;
        }

        // Sync - show confirm dialog
        if (flow.enabled) {
            void confirm({
                title: 'Disable sync?',
                description:
                    'Disabling this sync will result in the deletion of all related synced records potentially for multiple connections. The endpoints to fetch these records will no longer work.',
                confirmButtonText: 'Disable',
                confirmVariant: 'destructive',
                onConfirm: async () => {
                    await onDisable();
                }
            });
        } else {
            void confirm({
                title: 'Enable sync?',
                description: 'It will start syncing potentially for multiple connections. This will impact your billing.',
                confirmButtonText: 'Enable',
                confirmVariant: 'primary',
                onConfirm: async () => {
                    await onEnable();
                }
            });
        }
    };

    const onEnable = async () => {
        if (!flow.type) {
            return;
        }

        const body = {
            provider: integration.provider,
            providerConfigKey: integration.unique_key,
            type: flow.type,
            scriptName: flow.name
        };

        try {
            if (flow.id) {
                await enableFlow({ params: { id: flow.id }, body });
            } else {
                await deployFlow(body);
            }
            toast({ title: `Enabled successfully`, variant: 'success' });
            if (plan && plan.auto_idle && !plan.trial_end_at) {
                void mutateEnv();
            }
        } catch (err) {
            if (err instanceof APIError) {
                const { code, message } = (err.json as ApiError<string>).error;
                if (code === 'resource_capped' || code === 'plan_limit') {
                    toast({ title: message, variant: 'error' });
                    return;
                }
            }
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        }
    };

    const onDisable = async () => {
        if (!flow.id || !flow.type) {
            return;
        }

        try {
            await disableFlow({
                params: { id: flow.id },
                body: {
                    provider: integration.provider,
                    providerConfigKey: integration.unique_key,
                    type: flow.type,
                    scriptName: flow.name
                }
            });
            toast({ title: `Disabled successfully`, variant: 'success' });
        } catch {
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        }
    };

    return (
        <div
            className="flex gap-2"
            onClick={(e) => {
                e.stopPropagation();
            }}
        >
            <Switch
                name="script"
                checked={flow.enabled === true}
                className="cursor-pointer"
                disabled={loading}
                onClick={(e) => {
                    e.preventDefault();
                    toggleSync();
                }}
            />
            {flow.type === 'action' && loading && <Loader2 className="animate-spin size-4" />}
            {DialogComponent}
        </div>
    );
};
