import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { WorkspaceModeProvider } from './hooks/useWorkspaceMode';
import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { HomePage } from './pages/buyer/HomePage';
import { NewRequestPage } from './pages/buyer/NewRequestPage';
import { EditRequestPage } from './pages/buyer/EditRequestPage';
import { SupplierDetailPage } from './pages/buyer/SupplierDetailPage';
import { OffersPage } from './pages/buyer/OffersPage';
import { ProfilePage } from './pages/buyer/ProfilePage';
import { ProductPage } from './pages/buyer/ProductPage';
import { RequestDetailPage } from './pages/buyer/RequestDetailPage';
import { RequestsPage } from './pages/buyer/RequestsPage';
import { SuppliersPage } from './pages/buyer/SuppliersPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { SupplierCompanyPage } from './pages/supplier/SupplierCompanyPage';
import { SupplierCrmPage } from './pages/supplier/SupplierCrmPage';
import { SupplierCrmSettingsPage } from './pages/supplier/SupplierCrmSettingsPage';
import { SupplierDashboardPage } from './pages/supplier/SupplierDashboardPage';
import { SupplierOffersPage } from './pages/supplier/SupplierOffersPage';
import { SupplierLeadsPage } from './pages/supplier/SupplierLeadsPage';
import { SupplierTasksPage } from './pages/supplier/SupplierTasksPage';
import { SupplierProductsPage } from './pages/supplier/SupplierProductsPage';
import { SupplierProductDetailPage } from './pages/supplier/SupplierProductDetailPage';
import { SupplierTeamPage } from './pages/supplier/SupplierTeamPage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';
import { LandingPage } from './pages/LandingPage';

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceModeProvider>
        <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests"
          element={
            <ProtectedRoute>
              <RequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests/new"
          element={
            <ProtectedRoute>
              <NewRequestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests/:id/edit"
          element={
            <ProtectedRoute>
              <EditRequestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests/:id"
          element={
            <ProtectedRoute>
              <RequestDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/offers"
          element={
            <ProtectedRoute>
              <OffersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute>
              <SuppliersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers/:id"
          element={
            <ProtectedRoute>
              <SupplierDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products/:id"
          element={
            <ProtectedRoute>
              <ProductPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/conversations"
          element={
            <ProtectedRoute>
              <ConversationsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/supplier/crm/settings"
          element={
            <ProtectedRoute>
              <SupplierCrmSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier"
          element={
            <ProtectedRoute>
              <SupplierDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier/deals"
          element={
            <ProtectedRoute>
              <SupplierCrmPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier/offers"
          element={
            <ProtectedRoute>
              <SupplierOffersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier/tasks"
          element={
            <ProtectedRoute>
              <SupplierTasksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier/leads"
          element={
            <ProtectedRoute>
              <SupplierLeadsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier/products/new"
          element={
            <ProtectedRoute>
              <SupplierProductDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier/products/:id"
          element={
            <ProtectedRoute>
              <SupplierProductDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier/products"
          element={
            <ProtectedRoute>
              <SupplierProductsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier/team"
          element={
            <ProtectedRoute>
              <SupplierTeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplier/company"
          element={
            <ProtectedRoute>
              <SupplierCompanyPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WorkspaceModeProvider>
    </AuthProvider>
  );
}
