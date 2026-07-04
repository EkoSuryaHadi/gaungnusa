import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56 transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
