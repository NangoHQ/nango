import { Prism } from '@mantine/prism';
import { CalendarIcon } from '@radix-ui/react-icons';
import { useMemo } from 'react';

import { LevelTag } from './components/LevelTag';
import { Tag } from '../../components/ui/label/Tag';
import { formatDateToLogFormat } from '../../utils/utils';

import type { MessageRow } from '@nangohq/types';

export const ShowMessage: React.FC<{ message: MessageRow }> = ({ message }) => {
    const createdAt = useMemo(() => {
        return formatDateToLogFormat(message.createdAt);
    }, [message.createdAt]);

    const payload = useMemo(() => {
        if (!message.meta && !message.error && !message.request && !message.response) {
            return null;
        }

        const pl: Record<string, any> = message.meta ? { ...message.meta } : {};
        if (message.request) {
            pl.request = message.request;
        }
        if (message.response) {
            pl.response = message.response;
        }
        if (message.retry) {
            pl.retry = message.retry;
        }
        if (message.persistResults) {
            pl.persistResults = message.persistResults;
        }
        if (message.error) {
            pl.error = { message: message.error.message };
            if (message.error.payload) {
                pl.error.payload = message.error.payload;
            }
        }
        return pl;
    }, [message.meta, message.error]);

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
                <div className="text-gray-400 text-sm bg-pure-black py-2 max-h-36 overflow-y-scroll">
                    <Prism
                        language="json"
                        className="transparent-code"
                        colorScheme="dark"
                        styles={() => {
                            return { code: { padding: '0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } };
                        }}
                        noCopy
                    >
                        {message.message}
                    </Prism>
                </div>
            </div>
            <div className="overflow-x-hidden">
                <h4 className="font-semibold text-sm mb-2">Payload</h4>

                {payload ? (
                    <div className="text-gray-400 text-sm bg-pure-black py-2 h-full overflow-y-scroll">
                        <Prism
                            language="json"
                            className="transparent-code"
                            colorScheme="dark"
                            styles={() => {
                                return { code: { padding: '0', whiteSpace: 'pre-wrap' } };
                            }}
                        >
                            {JSON.stringify(payload, null, 2)}
                        </Prism>
                    </div>
                ) : (
                    <div className="text-gray-400 text-xs bg-pure-black py-4 px-4">No payload.</div>
                )}
            </div>
        </div>
    );
};
