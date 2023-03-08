import { Routes, Route, Navigate } from 'react-router-dom';
import Signup from './pages/Signup';
import Signin from './pages/Signin';
import IntegrationList from './pages/IntegrationList';
import IntegrationCreate from './pages/IntegrationCreate';
import ConnectionList from './pages/ConnectionList';
import ConnectionDetails from './pages/ConnectionDetails';
import ProjectSettings from './pages/ProjectSettings';
import PrivateRoute from './components/PrivateRoute';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
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
                <Route path="/connections" element={<PrivateRoute />}>
                    <Route path="/connections" element={<ConnectionList />} />
                </Route>
                <Route path="/connection/:providerConfigKey/:connectionId" element={<PrivateRoute />}>
                    <Route path="/connection/:providerConfigKey/:connectionId" element={<ConnectionDetails />} />
                </Route>
                <Route path="/project-settings" element={<PrivateRoute />}>
                    <Route path="/project-settings" element={<ProjectSettings />} />
                </Route>
                {isCloud() && <Route path="/signin" element={<Signin />} />}
                {isCloud() && <Route path="/signup" element={<Signup />} />}
                {isCloud() && <Route path="/forgot-password" element={<ForgotPassword />} />}
                {isCloud() && <Route path="/reset-password/:token" element={<ResetPassword />} />}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ToastContainer />
        </>
    );
};

export default App;
