import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteFallback } from './components/RouteFallback';
import { WorkspaceModeProvider } from './hooks/useWorkspaceMode';
import { LandingPage } from './pages/LandingPage';

// Каждая страница — отдельный чанк: гость на лендинге не тянет кабинет.
const LoginPage = lazy(() =>
  import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const RegisterPage = lazy(() =>
  import('./pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const HomePage = lazy(() =>
  import('./pages/buyer/HomePage').then((m) => ({ default: m.HomePage })),
);
const NewRequestPage = lazy(() =>
  import('./pages/buyer/NewRequestPage').then((m) => ({ default: m.NewRequestPage })),
);
const EditRequestPage = lazy(() =>
  import('./pages/buyer/EditRequestPage').then((m) => ({ default: m.EditRequestPage })),
);
const SupplierDetailPage = lazy(() =>
  import('./pages/buyer/SupplierDetailPage').then((m) => ({ default: m.SupplierDetailPage })),
);
const OffersPage = lazy(() =>
  import('./pages/buyer/OffersPage').then((m) => ({ default: m.OffersPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/buyer/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const ProductPage = lazy(() =>
  import('./pages/buyer/ProductPage').then((m) => ({ default: m.ProductPage })),
);
const RequestDetailPage = lazy(() =>
  import('./pages/buyer/RequestDetailPage').then((m) => ({ default: m.RequestDetailPage })),
);
const RequestsPage = lazy(() =>
  import('./pages/buyer/RequestsPage').then((m) => ({ default: m.RequestsPage })),
);
const SuppliersPage = lazy(() =>
  import('./pages/buyer/SuppliersPage').then((m) => ({ default: m.SuppliersPage })),
);
const ConversationsPage = lazy(() =>
  import('./pages/ConversationsPage').then((m) => ({ default: m.ConversationsPage })),
);
const SupplierCompanyPage = lazy(() =>
  import('./pages/supplier/SupplierCompanyPage').then((m) => ({ default: m.SupplierCompanyPage })),
);
const SupplierCrmPage = lazy(() =>
  import('./pages/supplier/SupplierCrmPage').then((m) => ({ default: m.SupplierCrmPage })),
);
const SupplierCrmSettingsPage = lazy(() =>
  import('./pages/supplier/SupplierCrmSettingsPage').then((m) => ({ default: m.SupplierCrmSettingsPage })),
);
const SupplierDashboardPage = lazy(() =>
  import('./pages/supplier/SupplierDashboardPage').then((m) => ({ default: m.SupplierDashboardPage })),
);
const SupplierOffersPage = lazy(() =>
  import('./pages/supplier/SupplierOffersPage').then((m) => ({ default: m.SupplierOffersPage })),
);
const SupplierLeadsPage = lazy(() =>
  import('./pages/supplier/SupplierLeadsPage').then((m) => ({ default: m.SupplierLeadsPage })),
);
const SupplierTasksPage = lazy(() =>
  import('./pages/supplier/SupplierTasksPage').then((m) => ({ default: m.SupplierTasksPage })),
);
const SupplierProductsPage = lazy(() =>
  import('./pages/supplier/SupplierProductsPage').then((m) => ({ default: m.SupplierProductsPage })),
);
const SupplierProductDetailPage = lazy(() =>
  import('./pages/supplier/SupplierProductDetailPage').then((m) => ({ default: m.SupplierProductDetailPage })),
);
const SupplierTeamPage = lazy(() =>
  import('./pages/supplier/SupplierTeamPage').then((m) => ({ default: m.SupplierTeamPage })),
);
const InviteAcceptPage = lazy(() =>
  import('./pages/InviteAcceptPage').then((m) => ({ default: m.InviteAcceptPage })),
);
const LiveLandingPage = lazy(() =>
  import('./landing/live').then((m) => ({ default: m.LiveLandingPage })),
);

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceModeProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/live"
            element={
              <ProtectedRoute>
                <LiveLandingPage />
              </ProtectedRoute>
            }
          />
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
        </Suspense>
      </WorkspaceModeProvider>
    </AuthProvider>
  );
}
