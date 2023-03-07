import { Routes, Route, Navigate } from 'react-router-dom';
import Signup from './pages/Signup';
import Signin from './pages/Signin';
import IntegrationList from './pages/IntegrationList';
import IntegrationCreate from './pages/IntegrationCreate';
import ConnectionList from './pages/ConnectionList';
import ConnectionDetails from './pages/ConnectionDetails';
import ProjectSettings from './pages/ProjectSettings';
import PrivateRoute from './components/PrivateRoute';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { isCloud } from './utils/utils';

const App = () => {
    return (
        <>
            <Routes>
                <Route path="/" element={<Navigate to="/integration" replace />} />
                <Route path="/integration" element={<PrivateRoute />}>
                    <Route path="/integration" element={<IntegrationList />} />
                </Route>
                <Route path="/integration/create" element={<PrivateRoute />}>
                    <Route path="/integration/create" element={<IntegrationCreate />} />
                </Route>
                <Route path="/connection" element={<PrivateRoute />}>
                    <Route path="/connection" element={<ConnectionList />} />
                </Route>
                <Route path="/connection/:providerConfigKey/:connectionId" element={<PrivateRoute />}>
                    <Route path="/connection/:providerConfigKey/:connectionId" element={<ConnectionDetails />} />
                </Route>
                <Route path="/project-settings" element={<PrivateRoute />}>
                    <Route path="/project-settings" element={<ProjectSettings />} />
                </Route>
                <Route path="/signin" element={<Signin />} />
                {isCloud() && <Route path="/signup" element={<Signup />} />}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ToastContainer />
        </>
    );
};

export default App;
