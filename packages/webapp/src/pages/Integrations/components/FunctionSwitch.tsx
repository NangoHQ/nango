import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { mutate } from 'swr';

import { useEnvironment } from '../../../hooks/useEnvironment.js';
import { apiFlowDisable, apiFlowEnable, apiPreBuiltDeployFlow } from '../../../hooks/useFlow.js';
import { useToast } from '../../../hooks/useToast.js';
import { useStore } from '../../../store.js';
import { Switch } from '@/components-v2/ui/switch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

import type { ApiIntegration, NangoSyncConfig } from '@nangohq/types';

export const FunctionSwitch: React.FC<{
    flow: NangoSyncConfig;
    integration: ApiIntegration;
}> = ({ flow, integration }) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { plan, mutate: mutateEnv } = useEnvironment(env);
    const { confirm, DialogComponent } = useConfirmDialog();

    const [loading, setLoading] = useState(false);

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
        setLoading(true);

        let res;
        if (flow.id) {
            // Already deployed, we just need to enable
            res = await apiFlowEnable(
                env,
                { id: flow.id },
                {
                    provider: integration.provider,
                    providerConfigKey: integration.unique_key,
                    type: flow.type!,
                    scriptName: flow.name
                }
            );
        } else {
            // Initial deployment
            res = await apiPreBuiltDeployFlow(env, {
                provider: integration.provider,
                providerConfigKey: integration.unique_key,
                type: flow.type!,
                scriptName: flow.name
            });
        }
        if ('error' in res.json) {
            if (res.json.error.code === 'resource_capped' || res.json.error.code === 'plan_limit') {
                toast({ title: res.json.error.message, variant: 'error' });
            } else {
                toast({ title: 'An unexpected error occurred', variant: 'error' });
            }
        } else {
            toast({ title: `Enabled successfully`, variant: 'success' });
            await mutate((key) => typeof key === 'string' && key.startsWith('/api/v1/integrations'));

            if (plan && plan.auto_idle && !plan.trial_end_at) {
                await mutateEnv();
            }
        }

        setLoading(false);
    };

    const onDisable = async () => {
        if (!flow.id) {
            return;
        }

        setLoading(true);

        const res = await apiFlowDisable(
            env,
            { id: flow.id },
            {
                provider: integration.provider,
                providerConfigKey: integration.unique_key,
                type: flow.type!,
                scriptName: flow.name
            }
        );
        if ('error' in res.json) {
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        } else {
            toast({ title: `Disabled successfully`, variant: 'success' });
            await mutate((key) => typeof key === 'string' && key.startsWith('/api/v1/integrations'));
        }

        setLoading(false);
    };

    return (
        <div
            className="flex gap-2"
            onClick={(e) => {
                e.stopPropagation();
            }}
        >
            <div>
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
            </div>
            {flow.type === 'action' && loading && <Loader2 className="animate-spin size-4" />}
            {DialogComponent}
        </div>
    );
};
