import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gaung — Data Lakehouse Platform",
  description: "Upload, transform, visualize. Your data, your echo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <body className="min-h-screen bg-[#0b0f1f] text-slate-200 antialiased">
        {/* Background glow — fixed so it stays behind everything */}
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-emerald-500/10 to-indigo-500/5 blur-[120px] rounded-full" />
          <div className="absolute bottom-[20%] right-[-10%] w-[45%] h-[45%] bg-gradient-to-br from-indigo-500/10 to-purple-500/5 blur-[120px] rounded-full" />
        </div>
        {children}
      </body>
    </html>
  );
}
