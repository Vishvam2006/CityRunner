import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { useRunStore } from "../../store/run.store";

interface MobileLayoutProps {
  children: ReactNode;
}

export function MobileLayout({ children }: MobileLayoutProps) {
  const { isTracking } = useRunStore();
  
  // Adjust padding bottom based on whether nav is shown
  return (
    <div className={`min-h-[100dvh] w-full flex flex-col bg-slate-950 text-slate-50 transition-all ${isTracking ? '' : 'pb-16'}`}>
      <main className="flex-1 w-full flex flex-col relative">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
