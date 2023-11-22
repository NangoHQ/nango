import { useState } from 'react';
import { toast } from 'react-toastify';
import { useModal } from '@geist-ui/core';
import ActionModal from '../../../components/ui/Modal';
import ToggleButton from '../../../components/ui/button/ToggleButton';
import type { Flow } from '../../../types';
import { useCreateFlow } from '../../../utils/api';

export interface FlowProps {
    flow: Flow;
    provider: string;
    setLoaded: (loaded: boolean) => void;
    rawName?: string;
}

export default function EnableDisableSync({ flow, provider, setLoaded, rawName }: FlowProps) {
    const { setVisible, bindings } = useModal();
    const createFlow = useCreateFlow();

    const [modalTitle, setModalTitle] = useState('');
    const [modalContent, setModalContent] = useState('');
    const [modalAction, setModalAction] = useState<(() => void) | null>(null);
    const [modalShowSpinner, setModalShowSpinner] = useState(false);
    const [modalTitleColor, setModalTitleColor] = useState('text-white');

    const enableSync = (flow: Flow) => {
        setModalTitle('Enable sync?');
        setModalTitleColor('text-white')
        // TODO
        setModalContent('Records will start syncing potentially for multiple connections. This will impact your billing.');
        setModalAction(() => () => onEnableSync(flow));
        setVisible(true);
    }

    const onEnableSync = async (flow: Flow) => {
        const flowPayload = {
            provider,
            type: 'sync',
            name: flow.name,
            runs: flow.runs as string,
            auto_start: flow.auto_start === true,
            track_deletes: flow.track_deletes,
            sync_type: flow.sync_type,
            models: flow.models.map(model => model.name),
            scopes: flow.scopes,
            input: flow.input,
            returns: flow.returns,
            metadata: {
                description: flow.description,
                scopes: flow.scopes,
            },
            endpoints: flow.endpoints,
            output: flow.output,
            pre_built: flow.pre_built,
            is_public: flow.is_public,
            model_schema: JSON.stringify(flow.models),
            public_route: rawName || provider
        };

        setModalShowSpinner(true);
        const res = await createFlow([flowPayload]);
        if (res?.status === 201) {
            setLoaded(false);
        } else {
            const payload = await res?.json();
            toast.error(payload.error, {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }
        setModalShowSpinner(false);
        setVisible(false);
    }

    const disableSync = (flow: Flow) => {
        if (!flow.is_public) {
            setModalTitleColor('text-white')
            setModalTitle('Only public syncs can be disabled');
            setModalContent('If you want to disable this sync, delete it from your `nango.yaml` configuration file.')
            setModalAction(null);
            setVisible(true);

            return;
        }

        setModalTitle('Disable sync? (destructive action)');
        setModalTitleColor('text-pink-600')
        // TODO
        setModalContent('Disabling this sync will result in the deletion of all related synced records potentially for multiple connections. The endpoints to fetch these records will no longer work.');
        setModalAction(() => () => onDisableSync(flow));
        setVisible(true);
    }

    const onDisableSync = async (flow: Flow) => {
        setModalShowSpinner(true);
        const res = await fetch(`/api/v1/flow/${flow?.id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
        });

        if (res.status === 204) {
            setLoaded(false);
        } else {
            toast.error('Something went wrong', {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }
        setModalShowSpinner(false);
        setVisible(false);
    }

    const toggleSync = async (flow: Flow) => {
        const active = 'version' in flow;
        if (active) {
            await disableSync(flow);
        } else {
            await enableSync(flow);
        }
    }

    return (
        <>
            <ActionModal
                bindings={bindings}
                modalTitle={modalTitle}
                modalContent={modalContent}
                modalAction={modalAction}
                modalShowSpinner={modalShowSpinner}
                modalTitleColor={modalTitleColor}
                setVisible={setVisible}
            />
            <ToggleButton enabled={Boolean('version' in flow)} onChange={() => toggleSync(flow)} />
        </>
    );
}
