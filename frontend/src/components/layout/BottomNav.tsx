import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Map as MapIcon, User, Flag } from "lucide-react";
import { useRunStore } from "../../store/run.store";

export function BottomNav() {
  const location = useLocation();
  const { isTracking } = useRunStore();

  // Hide navigation during an active run
  if (isTracking || location.pathname === "/run") return null;

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16 px-4">
        <NavItem to="/" icon={<Home size={24} />} label="Home" active={isActive("/")} />
        <NavItem to="/territory" icon={<Flag size={24} />} label="Territory" active={isActive("/territory")} />
        <NavItem to="/profile" icon={<User size={24} />} label="Profile" active={isActive("/profile")} />
      </div>
    </nav>
  );
}

function NavItem({ to, icon, label, active }: { to: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
        active ? "text-blue-500" : "text-slate-400 hover:text-slate-300"
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}
