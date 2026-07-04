import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const dashboards = await prisma.dashboard.findMany({
    where: { userId: session.userId },
    include: {
      widgets: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  function timeAgo(date: Date): string {
    const now = Date.now();
    const diff = now - new Date(date).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboards</h1>
          <p className="text-sm text-slate-400">
            {dashboards.length} dashboard{dashboards.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/dashboards/new"
          className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
        >
          <span className="text-lg">+</span> New Dashboard
        </Link>
      </div>

      {/* Dashboard Cards Grid */}
      {dashboards.length === 0 ? (
        <div className="glass p-12 text-center space-y-4">
          <div className="text-5xl">📊</div>
          <h3 className="text-lg font-bold text-white">
            No dashboards yet &mdash; create one!
          </h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Build interactive dashboards with charts, KPIs, and tables to
            visualize your data.
          </p>
          <Link
            href="/dashboards/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-all"
          >
            <span className="text-lg">+</span>
            Create Your First Dashboard
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <Link
              key={dashboard.id}
              href={`/dashboards/${dashboard.id}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-6 space-y-4 hover:border-emerald-500/30 transition-all group hover:-translate-y-1"
            >
              {/* Name */}
              <h3 className="font-bold text-white text-base line-clamp-1 group-hover:text-emerald-400 transition-colors">
                {dashboard.name}
              </h3>

              {/* Description */}
              {dashboard.description ? (
                <p className="text-sm text-slate-400 line-clamp-2">
                  {dashboard.description}
                </p>
              ) : (
                <p className="text-sm text-slate-600 italic">
                  No description
                </p>
              )}

              {/* Meta row */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800">
                <span className="flex items-center gap-1.5">
                  <span className="text-base">📈</span>
                  {dashboard.widgets.length}{" "}
                  widget{dashboard.widgets.length !== 1 ? "s" : ""}
                </span>
                <span>
                  Updated {timeAgo(dashboard.updatedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
