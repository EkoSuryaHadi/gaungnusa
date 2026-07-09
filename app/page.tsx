export default function LandingPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-24 text-center space-y-8">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
        Data Lakehouse Platform
      </div>
      
      <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-white leading-tight">
        Data Masuk,<br />
        <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-400 bg-clip-text text-transparent">
          Insight Bergema
        </span>
      </h1>
      
      <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
        Upload data dari mana saja. Transformasi otomatis lewat pipeline ETL visual. 
        Simpan dalam lakehouse 3-tier. Bangun dashboard drag & drop. 
        <strong className="text-white"> Gaung</strong> — echo dari data Anda.
      </p>

      <div className="flex gap-4 justify-center pt-4">
        <a href="/login" className="px-8 py-3.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all">
          Mulai Sekarang
        </a>
        <a href="#features" className="px-8 py-3.5 rounded-xl border border-slate-700 bg-slate-900/60 backdrop-blur text-slate-300 font-bold hover:bg-slate-900 hover:text-white transition-all">
          Pelajari →
        </a>
      </div>

      {/* Quick Features */}
      <div id="features" className="grid gap-6 md:grid-cols-3 pt-20">
        {[
          { icon: "📥", title: "Multi-Source Ingest", desc: "CSV, Excel, JSON, API, Database — upload dari mana saja." },
          { icon: "⚙️", title: "Visual ETL Pipeline", desc: "Drag & drop steps: Clean → Transform → Join → Aggregate." },
          { icon: "📊", title: "Drag & Drop Dashboard", desc: "Bangun dashboard interaktif tanpa coding." },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-6 hover:border-emerald-500/30 transition-all group hover:-translate-y-1">
            <div className="text-3xl mb-4">{f.icon}</div>
            <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
            <p className="text-sm text-slate-400">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Lakehouse Tiers */}
      <div className="pt-20 space-y-4">
        <h2 className="text-2xl font-bold text-white">🏠 3-Tier Lakehouse</h2>
        <p className="text-slate-400 text-sm max-w-lg mx-auto">Data Anda terstruktur rapi dalam 3 layer.</p>
        <div className="grid gap-4 md:grid-cols-3 pt-4">
          {[
            { tier: "SILVER", color: "slate", desc: "Raw → Cleaned & Validated" },
            { tier: "BRONZE", color: "amber", desc: "Cleaned → Enriched & Joined" },
            { tier: "GOLD", color: "emerald", desc: "Enriched → Aggregated & KPIs" },
          ].map((t) => (
            <div key={t.tier} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <span className={`text-xs font-bold px-2 py-0.5 rounded bg-${t.color}-500/10 text-${t.color}-400`}>{t.tier}</span>
              <p className="text-sm text-slate-400 mt-2">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
