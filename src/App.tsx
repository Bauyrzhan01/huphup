import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { HomePage } from './pages/buyer/HomePage';
import { NewRequestPage } from './pages/buyer/NewRequestPage';
import { OffersPage } from './pages/buyer/OffersPage';
import { ProfilePage } from './pages/buyer/ProfilePage';
import { RequestDetailPage } from './pages/buyer/RequestDetailPage';
import { RequestsPage } from './pages/buyer/RequestsPage';
import { SuppliersPage } from './pages/buyer/SuppliersPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { SupplierCompanyPage } from './pages/supplier/SupplierCompanyPage';
import { SupplierCrmPage } from './pages/supplier/SupplierCrmPage';
import { SupplierLeadsPage } from './pages/supplier/SupplierLeadsPage';
import { SupplierProductsPage } from './pages/supplier/SupplierProductsPage';
import { SupplierTeamPage } from './pages/supplier/SupplierTeamPage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';
import { LandingPage } from './pages/LandingPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
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
          path="/supplier"
          element={
            <ProtectedRoute>
              <SupplierCrmPage />
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
    </AuthProvider>
  );
}
