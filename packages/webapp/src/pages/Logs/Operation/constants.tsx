import { IconChevronRight } from '@tabler/icons-react';

import { Tag } from '../../../components/ui/label/Tag';
import { formatDateToLogFormat, millisecondsToRuntime } from '../../../utils/utils';
import { LevelTag } from '../components/LevelTag';

import type { SearchMessagesData } from '@nangohq/types';
import type { ColumnDef } from '@tanstack/react-table';

export const defaultLimit = 50;

export const columns: ColumnDef<SearchMessagesData>[] = [
    {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        size: 180,
        cell: ({ row }) => {
            return <div className="font-code text-s">{formatDateToLogFormat(row.original.createdAt)}</div>;
        }
    },
    {
        accessorKey: 'duration',
        header: 'Duration',
        size: 100,
        cell: ({ row }) => {
            if (!row.original.durationMs) {
                return 'n/a';
            }
            const displayDuration = millisecondsToRuntime(row.original.durationMs).split(' ')[0];
            return <div className="font-code text-s">{displayDuration}</div>;
        }
    },
    {
        accessorKey: 'type',
        header: 'Type',
        size: 80,
        cell: ({ row }) => {
            return <Tag>{row.original.type === 'log' ? 'Message' : 'HTTP'}</Tag>;
        }
    },
    {
        accessorKey: 'level',
        header: 'Level',
        size: 70,
        cell: ({ row }) => {
            return <LevelTag level={row.original.level} />;
        }
    },
    {
        accessorKey: 'message',
        header: 'Additional Info',
        size: 'auto' as unknown as number,
        meta: {
            isGrow: true
        },
        cell: ({ row }) => {
            return <div className="truncate">{row.original.message}</div>;
        }
    },
    {
        accessorKey: 'id',
        header: '',
        size: 40,
        cell: ({ row }) => {
            if (!row.original.meta && !row.original.error && !row.original.request && !row.original.response) {
                return null;
            }
            return (
                <div className="-ml-2">
                    <IconChevronRight stroke={1} size={18} />
                </div>
            );
        }
    }
];
