import { Layout } from './Layout';

export const ErrorFallback: React.FC = () => {
    return (
        <Layout>
            <div className="p-4 text-red-base">An error occurred. Please refresh your page or contact us, support@nango.dev</div>
        </Layout>
    );
};
