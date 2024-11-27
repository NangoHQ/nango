import { Helmet } from 'react-helmet';
import DefaultLayout from '../../layout/DefaultLayout';
import { SignupForm } from './components/SignupForm';

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
