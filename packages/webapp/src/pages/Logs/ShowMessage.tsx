import type { MessageRow } from '@nangohq/types';
import { useMemo } from 'react';
import { formatDateToLogFormat } from '../../utils/utils';
import { Prism } from '@mantine/prism';
import { LevelTag } from './components/LevelTag';
import { Tag } from './components/Tag';
import { CalendarIcon } from '@radix-ui/react-icons';

export const ShowMessage: React.FC<{ message: MessageRow }> = ({ message }) => {
    const createdAt = useMemo(() => {
        return formatDateToLogFormat(message.createdAt);
    }, [message.createdAt]);

    return (
        <div className="py-8 px-6 flex flex-col gap-5 h-full">
            <header className="flex gap-2 flex-col border-b border-b-gray-400 pb-5">
                <div className="flex items-center ml-10">
                    <h3 className="text-xl font-semibold text-white">{message.type === 'log' ? 'Message' : 'HTTP'} Details</h3>
                </div>
                <div className="flex gap-3 items-center">
                    <div className="flex">
                        <LevelTag level={message.level} />
                    </div>
                    <div className="flex bg-border-gray-400 w-[1px] h-[16px]">&nbsp;</div>
                    <div className="flex gap-2 items-center">
                        <CalendarIcon />
                        <div className="text-gray-400 text-s pt-[1px] font-code">{createdAt}</div>
                    </div>
                </div>
            </header>

            <div className="flex gap-5 flex-wrap mt-4">
                <div className="flex gap-2 items-center w-[48%]">
                    <div className="font-semibold text-sm">Source</div>
                    <div className="text-gray-400 text-xs pt-[1px]">
                        <Tag>{message.source === 'internal' ? 'System' : 'User'}</Tag>
                    </div>
                </div>
            </div>
            <div>
                <h4 className="font-semibold text-sm mb-2">Message</h4>
                <div className="text-gray-400 text-sm bg-pure-black py-2">
                    <Prism
                        language="json"
                        className="transparent-code"
                        colorScheme="dark"
                        styles={() => {
                            return { code: { padding: '0', whiteSpace: 'pre-wrap' } };
                        }}
                        noCopy
                    >
                        {message.message}
                    </Prism>
                </div>
            </div>
            <div className="overflow-x-auto">
                <h4 className="font-semibold text-sm mb-2">Payload</h4>

                {message.meta ? (
                    <div className="text-gray-400 text-sm bg-pure-black py-2">
                        <Prism
                            language="json"
                            className="transparent-code"
                            colorScheme="dark"
                            styles={() => {
                                return { code: { padding: '0', whiteSpace: 'pre-wrap' } };
                            }}
                        >
                            {JSON.stringify({ error: message.error || undefined, output: message.meta || undefined }, null, 2)}
                        </Prism>
                    </div>
                ) : (
                    <div className="text-gray-400 text-xs bg-pure-black py-4 px-4">No payload.</div>
                )}
            </div>
        </div>
    );
};
