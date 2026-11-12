import { Plus } from 'lucide-react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { AppHeader } from '@/layout/AppHeader';

import type { AppHeaderEnvironment } from '@/layout/AppHeader';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'App Components/Layout/TopBar',
    parameters: { layout: 'fullscreen' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const DEV: AppHeaderEnvironment = { name: 'dev', isProduction: false };
const PROD: AppHeaderEnvironment = { name: 'prod', isProduction: true };

const ListPage: React.FC<{ environment: AppHeaderEnvironment }> = ({ environment }) => {
    const router = createMemoryRouter(
        [
            {
                path: '/:env/connections',
                handle: { breadcrumb: 'Connections' },
                element: (
                    <AppHeader
                        breadcrumbIsHeading
                        environment={environment}
                        actions={
                            <Button variant="primary">
                                <Plus />
                                Add test connection
                            </Button>
                        }
                    />
                )
            }
        ],
        { initialEntries: [`/${environment.name}/connections`] }
    );
    return <RouterProvider router={router} />;
};

const DetailPage: React.FC<{ environment: AppHeaderEnvironment }> = ({ environment }) => {
    const router = createMemoryRouter(
        [
            {
                path: '/:env/integrations',
                handle: { breadcrumb: 'Integrations' },
                children: [
                    {
                        path: ':providerConfigKey',
                        handle: { breadcrumb: 'github-app' },
                        element: <AppHeader breadcrumbIsHeading={false} environment={environment} />
                    }
                ]
            }
        ],
        { initialEntries: [`/${environment.name}/integrations/github-app`] }
    );
    return <RouterProvider router={router} />;
};

export const ListDev: Story = { render: () => <ListPage environment={DEV} /> };
export const ListProd: Story = { render: () => <ListPage environment={PROD} /> };
export const DetailDev: Story = { render: () => <DetailPage environment={DEV} /> };
export const DetailProd: Story = { render: () => <DetailPage environment={PROD} /> };
