import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth.store";
import { MobileLayout } from "./components/layout/MobileLayout";
import { Login } from "./features/auth/Login";
import { Register } from "./features/auth/Register";
import { Home } from "./features/home/Home";
import { ActiveRun } from "./features/run/ActiveRun";
import { Territory } from "./features/territory/Territory";
import { Profile } from "./features/profile/Profile";
import { Leaderboard } from "./features/leaderboard/Leaderboard";
import { useUser } from "./hooks/queries/useAuth";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  // Also prefetch user data if authenticated
  useUser();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);

  if (token) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <MobileLayout>
                <Login />
              </MobileLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <MobileLayout>
                <Register />
              </MobileLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MobileLayout>
                <Home />
              </MobileLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/run"
          element={
            <ProtectedRoute>
              <MobileLayout>
                <ActiveRun />
              </MobileLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/territory"
          element={
            <ProtectedRoute>
              <MobileLayout>
                <Territory />
              </MobileLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <MobileLayout>
                <Leaderboard />
              </MobileLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <MobileLayout>
                <Profile />
              </MobileLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;