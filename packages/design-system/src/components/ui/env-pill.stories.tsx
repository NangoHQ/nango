import { EnvPill } from './env-pill';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta<typeof EnvPill> = {
    title: 'Design System/Components/EnvPill',
    component: EnvPill,
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: { env: 'dev' }
};

export const Production: Story = {
    args: { env: 'prod', production: true }
};

export const LongName: Story = {
    args: { env: 'staging-europe-west-customer-sandbox' }
};
