import { SecretTextArea } from '@/components-v2/patterns/SecretTextArea';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SecretTextArea> = {
    component: SecretTextArea,
    title: 'Components v2/Patterns/SecretTextArea',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => <SecretTextArea defaultValue="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtEsHAFOPfgXm2oGJBNMFBBPT\n-----END RSA PRIVATE KEY-----" copy className="w-96" />
};

export const WithCopy: Story = {
    render: () => <SecretTextArea defaultValue="super-secret-multiline-value\nline2\nline3" copy className="w-96" />
};

export const WithoutCopy: Story = {
    render: () => <SecretTextArea defaultValue="secret-value-no-copy" className="w-96" />
};

export const NoReadPermission: Story = {
    render: () => <SecretTextArea defaultValue="hidden-secret" copy canRead={false} className="w-96" />
};

export const Empty: Story = {
    render: () => <SecretTextArea placeholder="Paste private key here..." copy className="w-96" />
};
