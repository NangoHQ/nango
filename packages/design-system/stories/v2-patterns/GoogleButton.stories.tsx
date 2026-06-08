import GoogleButton from '@/components/patterns/GoogleButton';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/Patterns/GoogleButton',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => <GoogleButton text="Sign in with Google" setServerErrorMessage={() => {}} />
};

export const SignUp: Story = {
    render: () => <GoogleButton text="Sign up with Google" setServerErrorMessage={() => {}} />
};
