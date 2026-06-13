import { useNavigate } from "react-router-dom";
import { useUser } from "../../hooks/queries/useAuth";
import { Card, CardContent } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Play, Flag, Activity } from "lucide-react";

export function Home() {
  const { data } = useUser();
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col p-4 pt-12 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Ready, Runner?</h1>
        {data?.user?.userId && (
          <p className="text-slate-400 mt-1">ID: {data.user.userId.slice(0, 8)}</p>
        )}
      </header>

      {/* Start Run Action */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative group cursor-pointer" onClick={() => navigate("/run")}>
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
          <button className="relative flex flex-col items-center justify-center w-48 h-48 bg-slate-900 rounded-full border-4 border-slate-800 shadow-2xl transition-transform transform active:scale-95">
            <Play className="w-16 h-16 text-blue-500 ml-2 mb-2" fill="currentColor" />
            <span className="text-xl font-bold tracking-wider text-slate-100 uppercase">Start</span>
          </button>
        </div>
      </div>

      {/* Quick Stats (Placeholders) */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex flex-col items-center justify-center space-y-2">
            <Activity className="w-8 h-8 text-emerald-400" />
            <div className="text-center">
              <p className="text-2xl font-bold">0.0 km</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Today</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex flex-col items-center justify-center space-y-2">
            <Flag className="w-8 h-8 text-blue-400" />
            <div className="text-center">
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Territories</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
