import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/Table';

import type { Meta, StoryObj } from '@storybook/react-vite';

const rows = [
    { id: 'user-001', integration: 'GitHub', status: 'Active', lastSync: '2 min ago' },
    { id: 'user-002', integration: 'Slack', status: 'Active', lastSync: '15 min ago' },
    { id: 'user-003', integration: 'HubSpot', status: 'Error', lastSync: '1 hr ago' }
];

const meta: Meta<typeof Table> = {
    component: Table,
    title: 'Components v2/UI/Table',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
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
                        <TableCell>{row.lastSync}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
};
