import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { mutate } from 'swr';

import { useEnvironment } from '../../../hooks/useEnvironment.js';
import { apiFlowDisable, apiFlowEnable, apiPreBuiltDeployFlow } from '../../../hooks/useFlow.js';
import { useToast } from '../../../hooks/useToast.js';
import { useStore } from '../../../store.js';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog';
import { Switch } from '@/components-v2/ui/switch';

import type { NangoSyncConfigWithEndpoint } from '../providerConfigKey/Endpoints/components/List.js';
import type { ApiIntegration } from '@nangohq/types';

export const FunctionSwitch: React.FC<{
    flow: NangoSyncConfigWithEndpoint;
    integration: ApiIntegration;
}> = ({ flow, integration }) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { plan, mutate: mutateEnv } = useEnvironment(env);

    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const toggleSync = async () => {
        if (flow.type === 'sync') {
            setOpen(!open);
        } else if (flow.type === 'action') {
            if (flow.enabled) {
                await onDisable();
            } else {
                await onEnable();
            }
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
            setOpen(false);

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
            setOpen(false);
        }
    };

    return (
        <div
            className="flex gap-2"
            onClick={(e) => {
                e.stopPropagation();
            }}
        >
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
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
                </DialogTrigger>
                <DialogContent>
                    {!flow.enabled && (
                        <>
                            <DialogTitle>Enable sync?</DialogTitle>
                            <DialogDescription>It will start syncing potentially for multiple connections. This will impact your billing.</DialogDescription>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="secondary">Cancel</Button>
                                </DialogClose>
                                <Button variant={'primary'} disabled={loading} className="disabled:bg-pure-black" onClick={() => onEnable()}>
                                    {loading && <Loader2 className="animate-spin" />}
                                    Enable
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                    {flow.enabled && (
                        <>
                            <DialogTitle>Disable sync?</DialogTitle>
                            <DialogDescription>
                                Disabling this sync will result in the deletion of all related synced records potentially for multiple connections. The
                                endpoints to fetch these records will no longer work.
                            </DialogDescription>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="secondary">Cancel</Button>
                                </DialogClose>
                                <Button variant="destructive" disabled={loading} className="disabled:bg-pure-black" onClick={() => onDisable()}>
                                    {loading && <Loader2 className="animate-spin" />}
                                    Disable
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
            <div className="w-[20px]">{flow.type === 'action' && loading && <Loader2 size={1} />}</div>
        </div>
    );
};
