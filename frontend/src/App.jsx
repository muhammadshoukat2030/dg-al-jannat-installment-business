import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import AddCustomer from './pages/AddCustomer';
import EditCustomer from './pages/EditCustomer';
import CustomerDetails from './pages/CustomerDetails';
import AddInstallmentPlan from './pages/AddInstallmentPlan';
import Investors from './pages/Investors';
import AddInvestor from './pages/AddInvestor';
import EditInvestor from './pages/EditInvestor';
import InvestorDetails from './pages/InvestorDetails';
import OwnerDashboard from './pages/OwnerDashboard';
import Withdrawals from './pages/Withdrawals';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './routes/ProtectedRoute';

export default function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/new" element={<AddCustomer />} />
          <Route path="/customers/:id" element={<CustomerDetails />} />
          <Route path="/customers/:id/edit" element={<EditCustomer />} />
          <Route path="/customers/:id/new-plan" element={<AddInstallmentPlan />} />
          <Route path="/investors" element={<Investors />} />
          <Route path="/investors/new" element={<AddInvestor />} />
          <Route path="/investors/:id" element={<InvestorDetails />} />
          <Route path="/investors/:id/edit" element={<EditInvestor />} />
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/withdrawals" element={<Withdrawals />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<div className="p-8 text-center text-gray-500">Page not found.</div>} />
      </Routes>
    </>
  );
}
