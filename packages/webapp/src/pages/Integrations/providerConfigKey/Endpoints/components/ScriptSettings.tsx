import { ArrowLeftIcon, GearIcon, Pencil1Icon, QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import Button from '../../../../../components/ui/button/Button';
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
import { apiFlowUpdateFrequency } from '../../../../../hooks/useFlow';
import { useToast } from '../../../../../hooks/useToast';
import { useStore } from '../../../../../store';
import { mutate } from 'swr';

const drawerWidth = '630px';
const frequencyRegex = /^(?<every>every )?(?<amount>[0-9])?\s?(?<unit>(m|mins?|minutes?|h|hrs?|hours?|d|days?))$/;

export const ScriptSettings: React.FC<{ integration: GetIntegration['Success']['data']; flow: NangoSyncConfigWithEndpoint }> = ({ integration, flow }) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);

    const [open, setOpen] = useState(false);

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
            setFrequencyError('Format should be "every (number) (minutes|hours|days)", e.g: "every 1 hour", "every 20 days"r');
            return;
        }

        const unit = reg.groups['unit'];
        const amount = parseInt(reg.groups['amount'], 10);

        if (unit.startsWith('m') && (amount < 5 || !amount)) {
            setFrequencyError('The minimum frequency is 5 minutes');
            return;
        }
        11;
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
                    Settings
                </Button>
            </DrawerTrigger>
            <DrawerContent className={cn(openFrequency && 'hidden')}>
                {' '}
                {/** hack otherwise we can't interact with the modal */}
                <div className={`w-[630px] relative h-screen ml-16 mt-9  select-text`}>
                    <div className="absolute -left-10">
                        <DrawerClose title="Close" className="w-7 h-7 flex items-center justify-center text-text-light-gray hover:text-white focus:text-white">
                            <ArrowLeftIcon className="" />
                        </DrawerClose>
                    </div>
                    <h2 className="text-xl font-semibold">Script Settings</h2>
                    <div className="flex flex-wrap gap-10 pt-7">
                        <InfoBloc title="Enabled" className="min-w-[250px]">
                            <ScriptToggle flow={flow} integration={integration} />
                        </InfoBloc>
                        {flow.is_public && (
                            <InfoBloc title="Source" className="min-w-[250px]">
                                Template
                                <a
                                    className="underline"
                                    rel="noreferrer"
                                    href={`${githubIntegrationTemplates}/${integration.integration.provider}/${flow.type}s/${flow.name}.ts`}
                                    target="_blank"
                                >
                                    v{flow.version || '0.0.1'}
                                </a>
                            </InfoBloc>
                        )}
                        <InfoBloc title="Script Type" className="min-w-[250px]">
                            {isSync ? 'Sync' : 'Action'}
                        </InfoBloc>
                        {isSync && (
                            <>
                                <InfoBloc title="Sync Type" className="min-w-[250px]">
                                    {flow.sync_type === 'FULL' ? 'Full refresh only' : 'Incremental sync'}
                                </InfoBloc>
                                <InfoBloc title="Sync Frequency" className="min-w-[250px]">
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
                                <InfoBloc title="Sync Metadata" className="min-w-[250px]">
                                    {flow.input ? (
                                        <code className="font-code text-xs border border-border-gray rounded-md px-1">{flow.input.name}</code>
                                    ) : (
                                        'n/a'
                                    )}
                                </InfoBloc>
                                <InfoBloc title="Detect Deletions" className="min-w-[250px]">
                                    {flow.track_deletes === true ? 'Yes' : 'No'}
                                </InfoBloc>
                                {flow.webhookSubscriptions && flow.webhookSubscriptions.length > 0 && (
                                    <InfoBloc title="Webhooks Subscriptions" className="min-w-[250px]">
                                        {flow.webhookSubscriptions.join(', ')}
                                    </InfoBloc>
                                )}
                                <InfoBloc title="Starts on new connection" className="min-w-[250px]">
                                    {flow.auto_start === true ? 'Yes' : 'No'}
                                </InfoBloc>
                            </>
                        )}
                        <InfoBloc title="Necessary scopes" className="min-w-[250px]">
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
