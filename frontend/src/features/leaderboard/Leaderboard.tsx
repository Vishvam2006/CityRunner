import { useLeaderboard, useMyLeaderboard } from "../../hooks/queries/useLeaderboard";
import { Loader2, Trophy, Medal, MapPin, Activity } from "lucide-react";
import { LeaderboardUser } from "../../types";

function PodiumPlace({ user, place }: { user?: LeaderboardUser, place: 1 | 2 | 3 }) {
  if (!user) return <div className="flex flex-col items-center justify-end w-1/3 opacity-50" />;

  const isGold = place === 1;
  const isSilver = place === 2;
  const isBronze = place === 3;

  const height = isGold ? "h-40" : isSilver ? "h-32" : "h-24";
  const colorClass = isGold ? "bg-amber-400" : isSilver ? "bg-slate-300" : "bg-amber-700";
  const glowClass = isGold ? "shadow-[0_0_20px_rgba(251,191,36,0.5)]" : isSilver ? "shadow-[0_0_15px_rgba(203,213,225,0.4)]" : "shadow-[0_0_10px_rgba(180,83,9,0.4)]";

  return (
    <div className="flex flex-col items-center justify-end w-1/3 group">
      <div className="flex flex-col items-center mb-3 animate-fade-in-up">
        {isGold && <Trophy className="w-8 h-8 text-amber-400 mb-1 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />}
        {!isGold && <Medal className={`w-6 h-6 mb-1 ${isSilver ? "text-slate-300" : "text-amber-700"}`} />}
        <span className="font-bold text-slate-200 text-sm truncate max-w-full px-1">{user.username}</span>
        <span className="text-xs text-slate-400 font-mono">{user.distance.toFixed(1)}km</span>
      </div>
      <div 
        className={`w-full rounded-t-xl transition-all duration-500 ease-out flex items-start justify-center pt-2 text-slate-900 font-black text-2xl ${height} ${colorClass} ${glowClass} group-hover:-translate-y-2 group-hover:brightness-110`}
      >
        {place}
      </div>
    </div>
  );
}

function LeaderboardRow({ user, isCurrentUser }: { user: LeaderboardUser, isCurrentUser?: boolean }) {
  return (
    <div 
      className={`flex items-center justify-between p-4 mb-3 rounded-2xl border transition-all duration-300 hover:scale-[1.02] ${
        isCurrentUser 
          ? "bg-blue-600/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]" 
          : "glass border-slate-800 hover:border-slate-700 hover:bg-slate-800/50"
      }`}
    >
      <div className="flex items-center space-x-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
          isCurrentUser ? "bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.6)]" : "bg-slate-800 text-slate-400"
        }`}>
          {user.rank}
        </div>
        <div className="flex flex-col">
          <span className={`font-semibold ${isCurrentUser ? "text-blue-100" : "text-slate-200"}`}>
            {user.username} {isCurrentUser && "(You)"}
          </span>
          <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
            <span className="flex items-center"><Activity className="w-3 h-3 mr-1" /> {user.runs} runs</span>
            <span className="flex items-center"><MapPin className="w-3 h-3 mr-1 text-emerald-400" /> {user.loops} loops</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-mono text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-200 to-slate-400">
          {user.distance.toFixed(1)}
        </span>
        <span className="text-xs text-slate-500 font-medium">km</span>
      </div>
    </div>
  );
}

export function Leaderboard() {
  const { data: leaderboardData, isLoading } = useLeaderboard();
  const { data: myData } = useMyLeaderboard();

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <p className="text-slate-400 animate-pulse">Loading rankings...</p>
      </div>
    );
  }

  const users = leaderboardData?.data || [];
  
  const podiumUsers = users.slice(0, 3);
  const listUsers = users.slice(3);

  // Reorder podium: 2nd, 1st, 3rd for visual hierarchy
  const second = podiumUsers[1];
  const first = podiumUsers[0];
  const third = podiumUsers[2];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-950">
      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-64 bg-blue-900/20 blur-[100px] pointer-events-none" />

      <header className="px-6 pt-12 pb-6 relative z-10">
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">
          Global Rankings
        </h1>
        <p className="text-slate-400 mt-2 font-medium">Top runners by total distance covered</p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-24 z-10 relative custom-scrollbar">
        {/* Podium Section */}
        {users.length > 0 && (
          <div className="flex items-end justify-center h-56 mt-4 mb-10 px-2">
            <PodiumPlace user={second} place={2} />
            <PodiumPlace user={first} place={1} />
            <PodiumPlace user={third} place={3} />
          </div>
        )}

        {/* List Section */}
        <div className="space-y-1">
          {listUsers.map((user) => (
            <LeaderboardRow 
              key={user.userId} 
              user={user} 
              isCurrentUser={user.userId === myData?.userId} 
            />
          ))}
          {users.length === 0 && (
            <div className="text-center py-10 text-slate-500">
              No ranked runners yet. Be the first!
            </div>
          )}
        </div>
      </div>

      {/* Sticky Current User Footer */}
      {myData && !users.some(u => u.userId === myData.userId && u.rank <= users.length) && (
        <div className="absolute bottom-0 left-0 right-0 p-4 pt-10 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent z-20 pb-20">
          <div className="backdrop-blur-xl bg-slate-900/80 border border-slate-700/50 rounded-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <LeaderboardRow user={myData} isCurrentUser={true} />
          </div>
        </div>
      )}
    </div>
  );
}
