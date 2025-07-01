import { useState } from 'react';
import { mutate } from 'swr';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../../components/ui/Dialog';
import Spinner from '../../../components/ui/Spinner';
import { Switch } from '../../../components/ui/Switch';
import { Button } from '../../../components/ui/button/Button';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { apiFlowDisable, apiFlowEnable, apiPreBuiltDeployFlow } from '../../../hooks/useFlow';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';

import type { NangoSyncConfigWithEndpoint } from '../providerConfigKey/Endpoints/components/List';
import type { GetIntegration } from '@nangohq/types';

export const ScriptToggle: React.FC<{
    flow: NangoSyncConfigWithEndpoint;
    integration: GetIntegration['Success']['data'];
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
                    provider: integration.integration.provider,
                    providerConfigKey: integration.integration.unique_key,
                    type: flow.type!,
                    scriptName: flow.name
                }
            );
        } else {
            // Initial deployment
            res = await apiPreBuiltDeployFlow(env, {
                provider: integration.integration.provider,
                providerConfigKey: integration.integration.unique_key,
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
                provider: integration.integration.provider,
                providerConfigKey: integration.integration.unique_key,
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
                                    <Button variant={'zinc'}>Cancel</Button>
                                </DialogClose>
                                <Button variant={'primary'} isLoading={loading} className="disabled:bg-pure-black" onClick={() => onEnable()}>
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
                                    <Button variant={'zinc'}>Cancel</Button>
                                </DialogClose>
                                <Button variant={'danger'} isLoading={loading} className="disabled:bg-pure-black" onClick={() => onDisable()}>
                                    Disable
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
            <div className="w-[20px]">{flow.type === 'action' && loading && <Spinner size={1} />}</div>
        </div>
    );
};
