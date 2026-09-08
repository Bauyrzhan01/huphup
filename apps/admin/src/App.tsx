import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { WalletsPage } from './pages/WalletsPage';
import { BillingPage } from './pages/BillingPage';
import { BillingTransactionsPage } from './pages/BillingTransactionsPage';
import { PricingPage } from './pages/PricingPage';
import { DealsPage } from './pages/DealsPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/wallets"
          element={
            <ProtectedRoute>
              <WalletsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <BillingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/transactions"
          element={
            <ProtectedRoute>
              <BillingTransactionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/pricing"
          element={
            <ProtectedRoute>
              <PricingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deals"
          element={
            <ProtectedRoute>
              <DealsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/wallets" replace />} />
        <Route path="*" element={<Navigate to="/wallets" replace />} />
      </Routes>
    </AuthProvider>
  );
}
