import { ArrowLeftIcon, CheckCircledIcon, GearIcon, Pencil1Icon, QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { Button } from '../../../../../components/ui/button/Button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../../../../components/ui/Dialog';
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../../../../../components/ui/Drawer';
import { InfoBloc } from '../../../../../components/InfoBloc';
import { ScriptToggle } from '../../../components/ScriptToggle';
import type { GetIntegration } from '@nangohq/types';
import type { NangoSyncConfigWithEndpoint } from './List';
import { cn, githubIntegrationTemplates } from '../../../../../utils/utils';
import * as Tooltip from '../../../../../components/ui/Tooltip';
import { useState } from 'react';
import { Input } from '../../../../../components/ui/input/Input';
import { apiFlowUpdateFrequency, apiPreBuiltUpgrade } from '../../../../../hooks/useFlow';
import { useToast } from '../../../../../hooks/useToast';
import { useStore } from '../../../../../store';
import { mutate } from 'swr';
import { Link } from 'react-router-dom';

const drawerWidth = '630px';
// To sync with patchFrequency
const frequencyRegex =
    /^(?<every>every )?((?<amount>[0-9]+)?\s?(?<unit>(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?))|(?<unit2>(month|week|half day|half hour|quarter hour)))$/;

export const ScriptSettings: React.FC<{
    integration: GetIntegration['Success']['data'];
    flow: NangoSyncConfigWithEndpoint;
    open: boolean;
    setOpen: (value: boolean) => void;
}> = ({ integration, flow, open, setOpen }) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    // Upgrade
    const [openUpgrade, setOpenUpgrade] = useState(false);
    const [loadingUpgrade, setLoadingUpgrade] = useState(false);
    const onUpgrade = async () => {
        setLoadingUpgrade(true);

        // Already deployed, we just need to enable
        const res = await apiPreBuiltUpgrade(env, {
            id: flow.id!,
            lastDeployed: flow.last_deployed || '',
            upgradeVersion: flow.upgrade_version!,
            provider: integration.integration.provider,
            providerConfigKey: integration.integration.unique_key,
            type: flow.type!,
            scriptName: flow.name
        });
        if ('error' in res.json) {
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        } else {
            toast({ title: `Upgraded successfully`, variant: 'success' });
            await mutate((key) => typeof key === 'string' && key.startsWith('/api/v1/integrations'));
            setOpenFrequency(false);
        }

        setLoadingUpgrade(false);
    };

    // Frequency
    const [openFrequency, setOpenFrequency] = useState(false);
    const [loadingFrequency, setLoadingFrequency] = useState(false);
    const [frequency, setFrequency] = useState(flow.runs);
    const [frequencyError, setFrequencyError] = useState<string | null>(null);

    const onEditFrequency = async () => {
        setLoadingFrequency(true);

        // Already deployed, we just need to enable
        const res = await apiFlowUpdateFrequency(
            env,
            { id: flow.id! },
            {
                provider: integration.integration.provider,
                providerConfigKey: integration.integration.unique_key,
                type: flow.type!,
                scriptName: flow.name,
                frequency
            }
        );
        if ('error' in res.json) {
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        } else {
            toast({ title: `Update successfully`, variant: 'success' });
            await mutate((key) => typeof key === 'string' && key.startsWith('/api/v1/integrations'));
            setOpenFrequency(false);
        }

        setLoadingFrequency(false);
    };

    const onFrequencyChange = (value: string) => {
        setFrequency(value);

        const reg = value.match(frequencyRegex);
        if (!reg || !reg.groups) {
            setFrequencyError('Format should be "every (number) (seconds|minutes|hours|days)", e.g: "every 1 hour", "every 20 days"');
            return;
        }

        const unit = reg.groups['unit'];
        const amount = parseInt(reg.groups['amount'], 10);

        if (unit.startsWith('s') && (amount < 30 || !amount)) {
            setFrequencyError('The minimum frequency is 30 seconds');
            return;
        }
        setFrequencyError(null);
    };

    const isSync = flow.type === 'sync';

    return (
        <Drawer
            direction="right"
            snapPoints={open ? [drawerWidth] : []}
            handleOnly={true}
            noBodyStyles={true}
            dismissible={true}
            disablePreventScroll={true}
            modal={true}
            open={open}
            // onClose={() => setOpen(false)}
            onOpenChange={setOpen}
        >
            <DrawerTrigger asChild>
                <Button variant={'zombie'} className="text-text-light-gray">
                    <GearIcon />
                    Endpoint Configuration
                </Button>
            </DrawerTrigger>
            <DrawerContent className={cn(openFrequency && 'hidden')}>
                {/** hack otherwise we can't interact with the modal */}
                <div className={`w-[630px] relative h-screen px-16 mt-9 select-text`}>
                    <div className="absolute left-5">
                        <DrawerClose title="Close" className="w-7 h-7 flex items-center justify-center text-text-light-gray hover:text-white focus:text-white">
                            <ArrowLeftIcon className="" />
                        </DrawerClose>
                    </div>
                    <h2 className="text-xl font-semibold">Endpoint Configuration</h2>
                    <div className="text-s text-text-light-gray pt-7">
                        Nango endpoints are powered by integration scripts. Some of the following configurations can only be changed by modifying this
                        underlying script. If the source is a template, you will need to extend it to change certain configurations (
                        <Link to="https://docs.nango.dev/guides/custom-integrations/extend-a-pre-built-integration" className="underline">
                            guide
                        </Link>
                        ).
                    </div>
                    <div className="grid grid-cols-2 gap-10 pt-7">
                        <InfoBloc title="Enabled">
                            <ScriptToggle flow={flow} integration={integration} />
                        </InfoBloc>
                        {flow.is_public ? (
                            <InfoBloc title="Source">
                                <div className="flex flex-col gap-1">
                                    <div>
                                        Template{' '}
                                        <a
                                            className="underline"
                                            rel="noreferrer"
                                            href={`${githubIntegrationTemplates}/${integration.integration.provider}/${flow.type}s/${flow.name}.ts`}
                                            target="_blank"
                                        >
                                            v{flow.version || '0.0.1'}
                                        </a>
                                    </div>
                                    <div>
                                        {flow.upgrade_version ? (
                                            <div className="flex gap-2 items-center">
                                                <div className="text-yellow-base">Outdated</div>

                                                <Dialog open={openUpgrade} onOpenChange={setOpenUpgrade}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="zinc" size="xs">
                                                            Upgrade to v{flow.upgrade_version}
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="pointer-events-auto">
                                                        <DialogTitle>Upgrade to v{flow.upgrade_version}</DialogTitle>
                                                        <DialogDescription>
                                                            You are about to upgrade from version {flow.version} to{' '}
                                                            <a
                                                                className="underline"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                href={`${githubIntegrationTemplates}/${integration.integration.provider}/${flow.type}s/${flow.name}.ts`}
                                                            >
                                                                v{flow.upgrade_version}
                                                            </a>
                                                            . <br />
                                                            The new script will replace the old as soon as you upgrade. Major version changes indicate
                                                            incompatible API modifications, possibly requiring changes to your code.
                                                        </DialogDescription>
                                                        <DialogFooter>
                                                            <DialogClose asChild>
                                                                <Button variant={'zinc'}>Cancel</Button>
                                                            </DialogClose>
                                                            <Button
                                                                variant={'danger'}
                                                                isLoading={loadingUpgrade}
                                                                className="disabled:bg-pure-black"
                                                                onClick={() => onUpgrade()}
                                                            >
                                                                Upgrade
                                                            </Button>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 items-center text-green-base">
                                                <CheckCircledIcon />
                                                Up-to-date
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </InfoBloc>
                        ) : (
                            <InfoBloc title="Source">Custom v{flow.version}</InfoBloc>
                        )}
                        <InfoBloc title="Script Type">
                            <code className="font-code text-text-light-gray text-s bg-dark-600 px-2 rounded-md uppercase">{isSync ? 'Sync' : 'Action'}</code>
                        </InfoBloc>

                        {!flow.is_public && (
                            <InfoBloc title="Script Name">
                                <code className="font-code max-w-full break-all text-text-light-gray bg-dark-600 px-2 rounded-md text-xs">
                                    {integration.integration.unique_key}/{flow.type}/{flow.name}.ts
                                </code>
                            </InfoBloc>
                        )}
                        {isSync && (
                            <>
                                <InfoBloc title="Sync Type">{flow.sync_type === 'FULL' ? 'Full refresh only' : 'Incremental sync'}</InfoBloc>
                                <InfoBloc title="Sync Frequency">
                                    <div className="capitalize">{flow.runs}</div>
                                    {!flow.is_public && (
                                        <Tooltip.Tooltip delayDuration={0}>
                                            <Tooltip.TooltipTrigger asChild>
                                                <Button variant="icon" size={'xs'}>
                                                    <QuestionMarkCircledIcon />
                                                </Button>
                                            </Tooltip.TooltipTrigger>
                                            <Tooltip.TooltipContent side="bottom">
                                                <div className="flex text-white text-sm">
                                                    Edit the frequency directly in your <code className="font-code px-2">nango.yaml</code>
                                                </div>
                                            </Tooltip.TooltipContent>
                                        </Tooltip.Tooltip>
                                    )}
                                    {flow.is_public && flow.enabled && (
                                        <Dialog
                                            open={openFrequency}
                                            onOpenChange={(v) => {
                                                if (v) onFrequencyChange(flow.runs);
                                                setOpenFrequency(v);
                                            }}
                                        >
                                            <DialogTrigger asChild>
                                                <Button variant="icon" size={'xs'}>
                                                    <Pencil1Icon />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="pointer-events-auto">
                                                <DialogTitle>Edit sync frequency</DialogTitle>
                                                <DialogDescription>
                                                    This will affect potential many connections. Increased frequencies can increase your billing.
                                                </DialogDescription>
                                                <div className="flex flex-col gap-2">
                                                    <Input variant="black" value={frequency} onChange={(e) => onFrequencyChange(e.target.value)} autoFocus />
                                                    <div className="h-8">{frequencyError && <div className="text-sm text-red-base">{frequencyError}</div>}</div>
                                                </div>
                                                <DialogFooter>
                                                    <DialogClose asChild>
                                                        <Button variant={'zinc'}>Cancel</Button>
                                                    </DialogClose>
                                                    <Button
                                                        isLoading={loadingFrequency}
                                                        className="disabled:bg-pure-black"
                                                        onClick={() => onEditFrequency()}
                                                        disabled={frequencyError !== null || flow.runs === frequency}
                                                    >
                                                        Save
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                </InfoBloc>
                                <InfoBloc title="Sync Metadata">
                                    {flow.input ? (
                                        <code className="font-code text-xs border border-border-gray rounded-md px-1">{flow.input.name}</code>
                                    ) : (
                                        'n/a'
                                    )}
                                </InfoBloc>
                                <InfoBloc title="Detect Deletions">{flow.track_deletes === true ? 'Yes' : 'No'}</InfoBloc>
                                {flow.webhookSubscriptions && flow.webhookSubscriptions.length > 0 && (
                                    <InfoBloc title="Webhooks Subscriptions">{flow.webhookSubscriptions.join(', ')}</InfoBloc>
                                )}
                                <InfoBloc title="Starts on new connection">{flow.auto_start === true ? 'Yes' : 'No'}</InfoBloc>
                            </>
                        )}
                        <InfoBloc title="Necessary scopes">
                            {flow.scopes && flow.scopes.length > 0
                                ? flow.scopes.map((scope) => (
                                      <div className="font-code text-xs border border-border-gray rounded-md px-1" key={scope}>
                                          {scope}
                                      </div>
                                  ))
                                : 'n/a'}
                        </InfoBloc>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    );
};
