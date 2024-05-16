import type { MessageRow } from '@nangohq/types';
import { useMemo } from 'react';
import { formatDateToLogFormat } from '../../utils/utils';
import { Prism } from '@mantine/prism';
import { LevelTag } from './components/LevelTag';
import { Tag } from './components/Tag';

export const ShowMessage: React.FC<{ message: MessageRow }> = ({ message }) => {
    const createdAt = useMemo(() => {
        return formatDateToLogFormat(message.createdAt);
    }, [message.createdAt]);

    return (
        <div className="py-8 px-6 flex flex-col gap-5">
            <div className="flex items-center ml-10">
                <h3 className="text-xl font-semibold text-white flex gap-4 items-center">{message.type === 'log' ? 'Message' : 'HTTP'} Details</h3>
            </div>

            <div className="flex gap-5 flex-wrap mt-4">
                <div className="flex gap-2 items-center w-[48%]">
                    <div className="font-semibold text-sm">Timestamp</div>
                    <div className="text-gray-400 text-s pt-[1px] font-code">{createdAt}</div>
                </div>
                <div className="flex gap-2 items-center w-[48%]">
                    <div className="font-semibold text-sm">Status</div>
                    <div className="text-gray-400 text-xs pt-[1px]">
                        <LevelTag level={message.level} />
                    </div>
                </div>
                <div className="flex gap-2 items-center w-[48%]">
                    <div className="font-semibold text-sm">Source</div>
                    <div className="text-gray-400 text-xs pt-[1px]">
                        <Tag>{message.source === 'internal' ? 'System' : 'User'}</Tag>
                    </div>
                </div>
            </div>
            <div className="">
                <h4 className="font-semibold text-sm mb-2">Message</h4>
                <div className="text-gray-400 text-sm bg-pure-black py-4 px-4 font-code">{message.message}</div>
            </div>
            <div className="">
                <h4 className="font-semibold text-sm mb-2">Error</h4>

                <div className="text-gray-400 text-sm bg-pure-black py-2">
                    <Prism
                        language="json"
                        className="transparent-code"
                        colorScheme="dark"
                        styles={() => {
                            return { code: { padding: '0', whiteSpace: 'pre-wrap' } };
                        }}
                    >
                        {JSON.stringify(message.error, null, 2)}
                    </Prism>
                </div>
            </div>
        </div>
    );
};
