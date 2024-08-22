import { ArrowLeftIcon, GearIcon, QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import Button from '../../../../../components/ui/button/Button';
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../../../../../components/ui/Drawer';
import { InfoBloc } from '../../../../../components/InfoBloc';
import { EnableDisableSync } from '../../../components/EnableDisableSync';
import type { GetIntegration } from '@nangohq/types';
import type { NangoSyncConfigWithEndpoint } from './List';
import { githubIntegrationTemplates } from '../../../../../utils/utils';
import * as Tooltip from '../../../../../components/ui/Tooltip';

const drawerWidth = '630px';

export const ScriptSettings: React.FC<{ integration: GetIntegration['Success']['data']; flow: NangoSyncConfigWithEndpoint }> = ({ integration, flow }) => {
    const isSync = flow.type === 'sync';

    return (
        <Drawer direction="right" snapPoints={[drawerWidth]} handleOnly={true} noBodyStyles={true} dismissible={true} disablePreventScroll={true}>
            <DrawerTrigger asChild>
                <Button variant={'emptyFaded'}>
                    <GearIcon />
                    Script Settings
                </Button>
            </DrawerTrigger>
            <DrawerContent>
                <div className={`w-[630px] relative h-screen ml-16 mt-9  select-text`}>
                    <div className="absolute -left-10">
                        <DrawerClose title="Close" className="w-7 h-7 flex items-center justify-center text-text-light-gray hover:text-white focus:text-white">
                            <ArrowLeftIcon className="" />
                        </DrawerClose>
                    </div>
                    <h2 className="text-xl font-semibold">Script Configuration</h2>
                    <div className="flex flex-wrap gap-10 pt-7">
                        <InfoBloc title="Enabled" className="min-w-[250px]">
                            <EnableDisableSync flow={flow} integration={integration.integration} />
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
                                    {flow.sync_type}
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
                                </InfoBloc>
                                <InfoBloc title="Sync Metadata" className="min-w-[250px]">
                                    {flow.input || 'n/a'}
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
