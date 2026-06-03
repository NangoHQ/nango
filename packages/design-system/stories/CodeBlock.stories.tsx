import { CodeBlock } from '@/components-v2/ui/CodeBlock';

import type { Meta, StoryObj } from '@storybook/react-vite';

const sampleCode = `import Nango from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY });

const connection = await nango.getConnection('github', 'user-123');
console.log(connection.credentials);`;

const meta: Meta<typeof CodeBlock> = {
    component: CodeBlock,
    title: 'Components v2/UI/CodeBlock',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        title: 'Node.js',
        language: 'typescript',
        code: sampleCode,
        displayLanguage: 'TypeScript'
    }
};
