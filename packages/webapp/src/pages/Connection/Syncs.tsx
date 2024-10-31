import { Link } from 'react-router-dom';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import type { SyncResponse } from '../../types';
import type { ApiConnectionFull } from '@nangohq/types';
import { SyncRow } from './components/SyncRow';
import * as Table from '../../components/ui/Table';
import { useStore } from '../../store';
import { Info } from '../../components/Info';
import { getLogsUrl } from '../../utils/logs';
import { Fragment } from 'react/jsx-runtime';

interface SyncsProps {
    syncs: SyncResponse[] | undefined;
    connection: ApiConnectionFull;
    provider: string | null;
}

export const Syncs: React.FC<SyncsProps> = ({ syncs, connection, provider }) => {
    const env = useStore((state) => state.env);

    return (
        <div className="h-fit rounded-md text-white">
            {syncs && syncs.some((sync) => sync.active_logs?.log_id) && (
                <div className="flex my-4">
                    <Info variant={'destructive'}>
                        <div>
                            Last sync execution failed for the following sync
                            {syncs.filter((sync) => sync.active_logs?.log_id).length > 1 ? 's' : ''}:{' '}
                            {syncs
                                .filter((sync) => sync.active_logs?.log_id)
                                .map((sync, index) => (
                                    <Fragment key={sync.name}>
                                        {sync.name} (
                                        <Link className="underline" to={getLogsUrl({ env, operationId: sync.active_logs?.log_id, syncs: sync.name })}>
                                            logs
                                        </Link>
                                        ){index < syncs.filter((sync) => sync.active_logs?.log_id).length - 1 && ', '}
                                    </Fragment>
                                ))}
                            .
                        </div>
                    </Info>
                </div>
            )}

            {!syncs || syncs.length === 0 ? (
                <div className="flex flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                    <h2 className="text-xl text-center w-full">
                        No models are syncing for <span className="capitalize">{provider}</span>
                    </h2>
                    <div className="mt-4 text-gray-400">
                        Start syncing models for <span className="capitalize">{provider}</span> on the Sync Configuration tab.
                    </div>
                    <Link
                        to={`/${env}/integrations/${connection.provider_config_key}`}
                        className="flex justify-center w-auto items-center mt-5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                    >
                        <span className="flex">
                            <AdjustmentsHorizontalIcon className="flex h-5 w-5 mr-3" />
                            Integration Configuration
                        </span>
                    </Link>
                </div>
            ) : (
                <Table.Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head className="w-[120px]">Sync Name</Table.Head>
                            <Table.Head className="w-[120px]">Models</Table.Head>
                            <Table.Head className="w-[120px]">Last Execution</Table.Head>
                            <Table.Head className="w-[80px]">Frequency</Table.Head>
                            <Table.Head className="w-[120px]">Last Sync Start</Table.Head>
                            <Table.Head className="w-[130px]">Next Sync Start</Table.Head>
                            <Table.Head className="w-[40px]"></Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {syncs.map((sync) => (
                            <SyncRow key={sync.id} sync={sync} connection={connection} provider={provider} />
                        ))}
                    </Table.Body>
                </Table.Table>
            )}
        </div>
    );
};
