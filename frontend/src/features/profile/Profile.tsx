import { User as UserIcon, LogOut } from "lucide-react";
import { useUser } from "../../hooks/queries/useAuth";
import { useAuthStore } from "../../store/auth.store";
import { Button } from "../../components/ui/Button";

export function Profile() {
  const { data } = useUser();
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="flex-1 flex flex-col p-4 pt-12">
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-slate-400 mt-1">{data?.user?.userId.slice(0, 8)}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} className="text-red-400 hover:text-red-300 hover:bg-red-950/30">
          <LogOut className="w-6 h-6" />
        </Button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 p-8 glass-card rounded-3xl">
        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center">
          <UserIcon className="w-10 h-10 text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold">Runner Stats</h2>
        <p className="text-slate-400">
          Lifetime statistics are currently in development. Keep running to build your data!
        </p>
      </div>
    </div>
  );
}
