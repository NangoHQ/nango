import { Routes, Route, Navigate } from 'react-router-dom';
import Signup from './pages/Signup';
import InviteSignup from './pages/InviteSignup';
import Signin from './pages/Signin';
import IntegrationList from './pages/IntegrationList';
import IntegrationCreate from './pages/IntegrationCreate';
import ConnectionList from './pages/ConnectionList';
import ConnectionCreate from './pages/ConnectionCreate';
import ConnectionDetails from './pages/ConnectionDetails';
import ProjectSettings from './pages/ProjectSettings';
import PrivateRoute from './components/PrivateRoute';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Activity from './pages/Activity';
import Syncs from './pages/Syncs';
import AuthLink from './pages/AuthLink';
import AccountSettings from './pages/AccountSettings';
import UserSettings from './pages/UserSettings';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { isCloud } from './utils/utils';

const App = () => {
    return (
        <>
            <Routes>
                <Route path="/" element={<Navigate to="/integrations" replace />} />
                <Route path="/integrations" element={<PrivateRoute />}>
                    <Route path="/integrations" element={<IntegrationList />} />
                </Route>
                <Route path="/integration/create" element={<PrivateRoute />}>
                    <Route path="/integration/create" element={<IntegrationCreate />} />
                </Route>
                <Route path="/integration/:providerConfigKey" element={<PrivateRoute />}>
                    <Route path="/integration/:providerConfigKey" element={<IntegrationCreate />} />
                </Route>
                <Route path="/syncs" element={<PrivateRoute />}>
                    <Route path="/syncs" element={<Syncs />} />
                </Route>
                <Route path="/connections" element={<PrivateRoute />}>
                    <Route path="/connections" element={<ConnectionList />} />
                </Route>
                <Route path="/connections/create" element={<PrivateRoute />}>
                    <Route path="/connections/create" element={<ConnectionCreate />} />
                </Route>
                <Route path="/connections/create/:providerConfigKey" element={<PrivateRoute />}>
                    <Route path="/connections/create/:providerConfigKey" element={<ConnectionCreate />} />
                </Route>
                <Route path="/connections/:providerConfigKey/:connectionId" element={<PrivateRoute />}>
                    <Route path="/connections/:providerConfigKey/:connectionId" element={<ConnectionDetails />} />
                </Route>
                <Route path="/activity" element={<PrivateRoute />}>
                    <Route path="/activity" element={<Activity />} />
                </Route>
                <Route path="/project-settings" element={<PrivateRoute />}>
                    <Route path="/project-settings" element={<ProjectSettings />} />
                </Route>
                <Route path="/auth-link" element={<AuthLink />} />
                {isCloud() && (
                    <>
                        <Route path="/account-settings" element={<AccountSettings />} />
                        <Route path="/user-settings" element={<UserSettings />} />
                        <Route path="/signin" element={<Signin />} />
                        <Route path="/signup" element={<Signup />} />
                        <Route path="/signup/:token" element={<InviteSignup />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password/:token" element={<ResetPassword />} />
                    </>
                )}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ToastContainer />
        </>
    );
};

export default App;
