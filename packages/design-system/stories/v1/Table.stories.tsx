import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

import type { Meta, StoryObj } from '@storybook/react-vite';

const rows = [
    { id: 'user-001', integration: 'GitHub', status: 'Active', last: '2 min ago' },
    { id: 'user-002', integration: 'Slack', status: 'Active', last: '15 min ago' },
    { id: 'user-003', integration: 'HubSpot', status: 'Error', last: '1 hr ago' }
];

const meta: Meta = {
    title: 'Components v1/Table',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Connection ID</TableHead>
                        <TableHead>Integration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last sync</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.id}>
                            <TableCell>{row.id}</TableCell>
                            <TableCell>{row.integration}</TableCell>
                            <TableCell>{row.status}</TableCell>
                            <TableCell>{row.last}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
};
