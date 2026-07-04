import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [silverCount, bronzeCount, goldCount] = await Promise.all([
    prisma.lakehouseTable.count({ where: { layer: "SILVER" } }),
    prisma.lakehouseTable.count({ where: { layer: "BRONZE" } }),
    prisma.lakehouseTable.count({ where: { layer: "GOLD" } }),
  ]);

  const recentPipelines = await prisma.pipeline.findMany({
    where: { userId: session.id },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, name: true, status: true, updatedAt: true },
  });

  const recentSources = await prisma.dataSource.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, name: true, type: true, createdAt: true },
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400">Welcome back, {session.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300">{session.role}</span>
          <a href="/api/auth/logout" className="text-sm text-slate-400 hover:text-white">Logout</a>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { href: "/sources", icon: "📥", title: "Data Sources", desc: "Upload & manage data", color: "emerald" },
          { href: "/pipelines", icon: "⚙️", title: "ETL Pipelines", desc: "Build transform pipelines", color: "indigo" },
          { href: "/dashboards", icon: "📊", title: "Dashboards", desc: "Visualize your data", color: "amber" },
        ].map((item) => (
          <Link key={item.href} href={item.href}
            className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-6 hover:border-emerald-500/30 transition-all group hover:-translate-y-1">
            <div className="text-3xl mb-3">{item.icon}</div>
            <h3 className="font-bold text-white">{item.title}</h3>
            <p className="text-sm text-slate-400 mt-1">{item.desc}</p>
          </Link>
        ))}
      </div>

      {/* Lakehouse Status */}
      <div className="glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white">🏠 Lakehouse Status</h2>
          <Link href="/lakehouse" className="text-sm text-emerald-400 hover:underline">Explore →</Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { layer: "Bronze", desc: "Raw data", count: bronzeCount },
            { layer: "Silver", desc: "Cleaned data", count: silverCount },
            { layer: "Gold", desc: "Aggregated data", count: goldCount },
          ].map((l) => (
            <div key={l.layer} className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-sm text-slate-400">{l.layer}</p>
              <p className="text-2xl font-bold text-white">{l.count}</p>
              <p className="text-xs text-slate-500">{l.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="glass p-6 space-y-4">
        <h2 className="font-bold text-white">⚡ Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/pipelines/new"
            className="px-5 py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 text-sm"
          >
            <span>⚙️</span> Create Pipeline
          </Link>
          <Link
            href="/sources/new"
            className="px-5 py-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 font-bold hover:bg-sky-500/20 transition-all flex items-center gap-2 text-sm"
          >
            <span>📤</span> Upload Source
          </Link>
          <Link
            href="/lakehouse"
            className="px-5 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold hover:bg-purple-500/20 transition-all flex items-center gap-2 text-sm"
          >
            <span>🏠</span> Browse Lakehouse
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Pipelines */}
        <div className="glass p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">⚙️ Recent Pipelines</h2>
            <Link href="/pipelines" className="text-xs text-emerald-400 hover:underline">View all →</Link>
          </div>
          {recentPipelines.length === 0 ? (
            <p className="text-sm text-slate-500">No pipelines yet. <Link href="/pipelines/new" className="text-emerald-400 hover:underline">Create one</Link></p>
          ) : (
            <div className="space-y-2">
              {recentPipelines.map((p) => (
                <Link key={p.id} href={`/pipelines/${p.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30 hover:border-slate-600 transition-all">
                  <span className="text-sm text-white truncate">{p.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    p.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
                  }`}>{p.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sources */}
        <div className="glass p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">📥 Recent Sources</h2>
            <Link href="/sources" className="text-xs text-emerald-400 hover:underline">View all →</Link>
          </div>
          {recentSources.length === 0 ? (
            <p className="text-sm text-slate-500">No sources yet. <Link href="/sources/new" className="text-emerald-400 hover:underline">Upload one</Link></p>
          ) : (
            <div className="space-y-2">
              {recentSources.map((s) => (
                <Link key={s.id} href={`/sources/${s.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30 hover:border-slate-600 transition-all">
                  <span className="text-sm text-white truncate">{s.name}</span>
                  <span className="text-[10px] text-slate-400">{s.type}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
