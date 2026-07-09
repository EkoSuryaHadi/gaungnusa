import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import ChatPanel from "./components/ChatPanel";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 lg:ml-56 transition-all duration-300">
          {children}
        </main>
      </div>
      <ChatPanel />
    </AuthGuard>
  );
}
