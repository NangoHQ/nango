import { useState } from 'react';

import { StatusIndicator } from './status-indicator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSortButton } from './table';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta<typeof Table> = {
    title: 'Design System/Components/Table',
    component: Table,
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const operations = [
    { time: '14:29:22', duration: '–', status: { tone: 'info', label: 'Running' }, type: 'Sync run', fn: 'pages' },
    { time: '14:29:00', duration: '2.3s', status: { tone: 'success', label: 'Success' }, type: 'Sync run', fn: 'conversations' },
    { time: '14:28:24', duration: '283ms', status: { tone: 'success', label: 'Success' }, type: 'Proxy', fn: '—' },
    { time: '14:27:42', duration: '3.5s', status: { tone: 'danger', label: 'Failed' }, type: 'Auth refresh token', fn: '—' },
    { time: '14:24:05', duration: '20s', status: { tone: 'warning', label: 'Timeout' }, type: 'Webhook forward', fn: 'opportunity-updates' }
] as const;

const Mono: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="type-code-regular-xs text-text-secondary">{children}</span>;

export const Default: Story = {
    render: () => {
        const [selected, setSelected] = useState(1);
        return (
            <div className="bg-surface-panel">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Timestamp</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Function</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {operations.map((op, i) => (
                            <TableRow key={op.time} interactive selected={i === selected} flash={i === 0} onClick={() => setSelected(i)}>
                                <TableCell>
                                    <Mono>{op.time}</Mono>
                                </TableCell>
                                <TableCell>
                                    <Mono>{op.duration}</Mono>
                                </TableCell>
                                <TableCell>
                                    <StatusIndicator tone={op.status.tone} pulse={op.status.label === 'Running'}>
                                        {op.status.label}
                                    </StatusIndicator>
                                </TableCell>
                                <TableCell>{op.type}</TableCell>
                                <TableCell>{op.fn}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    }
};

const lines = [
    { time: '14:18:43.000', level: 'Info', message: 'Sync started · email-threads v1.0.0', duration: '' },
    { time: '14:18:43.120', level: 'Info', message: 'GET 200 gmail.googleapis.com/gmail/v1/users/me/threads', duration: '312ms' },
    { time: '14:18:43.480', level: 'Info', message: 'Fetched 100 threads', duration: '' }
];

export const Bordered: Story = {
    render: () => {
        const [order, setOrder] = useState<'asc' | 'desc'>('asc');
        const [open, setOpen] = useState<number | null>(1);
        const sorted = order === 'asc' ? lines : [...lines].reverse();
        return (
            <div className="max-w-xl">
                <Table variant="bordered" columns="96px 64px minmax(0,1fr) 56px">
                    <TableHeader>
                        <TableRow>
                            <TableHead>
                                <TableSortButton
                                    label="Timestamp"
                                    direction={order}
                                    directionLabels={{ asc: 'oldest first', desc: 'newest first' }}
                                    onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
                                />
                            </TableHead>
                            <TableHead>Level</TableHead>
                            <TableHead>Message</TableHead>
                            <TableHead>
                                <span className="w-full text-right">Duration</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sorted.map((line) => {
                            const index = lines.indexOf(line);
                            return (
                                <TableRow key={line.time} interactive selected={open === index} onClick={() => setOpen(open === index ? null : index)}>
                                    <TableCell>
                                        <Mono>{line.time}</Mono>
                                    </TableCell>
                                    <TableCell>
                                        <StatusIndicator size="sm">{line.level}</StatusIndicator>
                                    </TableCell>
                                    <TableCell>
                                        <span className="truncate">{line.message}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="w-full text-right">
                                            <Mono>{line.duration}</Mono>
                                        </span>
                                    </TableCell>
                                    {open === index && (
                                        <TableCell fullWidth>
                                            <pre className="py-2 type-code-regular-xs text-text-default">{'{\n  "response": { "status": 200 }\n}'}</pre>
                                        </TableCell>
                                    )}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        );
    }
};
