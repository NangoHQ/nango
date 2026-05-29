import { Body, Cell, Head, Header, Row, Table } from '@/components/ui/Table';

import type { Meta, StoryObj } from '@storybook/react-vite';

const rows = [
    { id: 'user-001', integration: 'GitHub', status: 'Active', last: '2 min ago' },
    { id: 'user-002', integration: 'Slack', status: 'Active', last: '15 min ago' },
    { id: 'user-003', integration: 'HubSpot', status: 'Error', last: '1 hr ago' }
];

const meta: Meta = {
    title: 'Components v1/UI/Table',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md">
            <Table>
                <Header>
                    <Row>
                        <Head>Connection ID</Head>
                        <Head>Integration</Head>
                        <Head>Status</Head>
                        <Head>Last sync</Head>
                    </Row>
                </Header>
                <Body>
                    {rows.map((row) => (
                        <Row key={row.id}>
                            <Cell>{row.id}</Cell>
                            <Cell>{row.integration}</Cell>
                            <Cell>{row.status}</Cell>
                            <Cell>{row.last}</Cell>
                        </Row>
                    ))}
                </Body>
            </Table>
        </div>
    )
};
