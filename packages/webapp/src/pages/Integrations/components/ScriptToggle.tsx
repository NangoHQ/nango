import { useState } from 'react';
import ToggleButton from '../../../components/ui/button/ToggleButton';
import type { GetIntegration } from '@nangohq/types';
import type { NangoSyncConfigWithEndpoint } from '../providerConfigKey/Endpoints/components/List';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../../components/ui/Dialog';
import Button from '../../../components/ui/button/Button';
import { useCreateFlow } from '../../../utils/api';
import { useStore } from '../../../store';

export const ScriptToggle: React.FC<{
    flow: NangoSyncConfigWithEndpoint;
    integration: GetIntegration['Success']['data'];
}> = ({ flow }) => {
    const env = useStore((state) => state.env);
    const _createFlow = useCreateFlow(env);

    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const toggleSync = () => {
        console.log('prat', flow.type);
        if (flow.type === 'sync') {
            setOpen(!open);
        }
    };

    const onEnable = () => {
        setLoading(true);
        _createFlow;
        // const flowPayload: ExtendedFlow = {
        //     provider: integration.integration.provider,
        //     providerConfigKey: integration.integration.unique_key,
        //     type: flow.type || 'sync',
        //     name: flow.name,
        //     runs: flow.runs,
        //     auto_start: flow.auto_start === true,
        //     track_deletes: flow.track_deletes === true,
        //     sync_type: flow.sync_type,
        //     models: flow.models.map((model) => model.name),
        //     scopes: flow.scopes || [],
        //     input: flow.input,
        //     returns: flow.returns,
        //     metadata: {
        //         description: flow.description,
        //         scopes: flow.scopes
        //     },
        //     endpoints: flow.endpoints,
        //     output: flow.returns,
        //     pre_built: flow.pre_built === true,
        //     is_public: flow.is_public === true,
        //     model_schema: JSON.stringify(flow.models),
        //     public_route: rawName || provider
        // };

        if (flow.id) {
            //
        } else {
            // await createFlow([flowPayload]);
        }

        setLoading(false);
    };
    const onDisable = () => {};

    return (
        <div
            className="flex"
            onClick={(e) => {
                console.log('ha', e);
                // e.preventDefault();
                e.stopPropagation();
            }}
        >
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <ToggleButton enabled={flow.enabled === true} onChange={() => toggleSync()} />
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
        </div>
    );
};
