import { Flag } from "lucide-react";

export function Territory() {
  return (
    <div className="flex-1 flex flex-col p-4 pt-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Territories</h1>
        <p className="text-slate-400 mt-1">Your captured zones</p>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 p-8 glass-card rounded-3xl">
        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center">
          <Flag className="w-10 h-10 text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold">Territory History</h2>
        <p className="text-slate-400">
          This feature is currently in development. Soon you will be able to see all territories you've captured across the city.
        </p>
      </div>
    </div>
  );
}
