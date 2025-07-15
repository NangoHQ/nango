import { Helmet } from 'react-helmet';

import { SignupForm } from './components/SignupForm';
import DefaultLayout from '../../layout/DefaultLayout';

export const Signup: React.FC = () => {
    return (
        <DefaultLayout>
            <Helmet>
                <title>Signup - Nango</title>
            </Helmet>
            <div className="flex flex-col justify-center">
                <div className="w-80">
                    <SignupForm />
                </div>
            </div>
        </DefaultLayout>
    );
};
