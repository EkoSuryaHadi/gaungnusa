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
        <a
          href="/login"
          className="px-8 py-3.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all"
        >
          Mulai Sekarang
        </a>
        <a
          href="/v3"
          className="px-8 py-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 backdrop-blur text-emerald-300 font-bold hover:bg-emerald-500/20 transition-all"
        >
          ⚡ V3 Dashboard →
        </a>
      </div>

      <div id="features" className="grid gap-6 md:grid-cols-3 pt-20">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-6 hover:border-emerald-500/30 transition-all group hover:-translate-y-1">
          <div className="text-3xl mb-4">📥</div>
          <h3 className="text-lg font-bold text-white mb-2">Multi-Source Ingest</h3>
          <p className="text-sm text-slate-400">CSV, Excel, JSON, API, Database — upload dari mana saja.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-6 hover:border-emerald-500/30 transition-all group hover:-translate-y-1">
          <div className="text-3xl mb-4">⚙️</div>
          <h3 className="text-lg font-bold text-white mb-2">Visual ETL Pipeline</h3>
          <p className="text-sm text-slate-400">Drag & drop steps: Clean → Transform → Join → Aggregate.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-6 hover:border-emerald-500/30 transition-all group hover:-translate-y-1">
          <div className="text-3xl mb-4">🧠</div>
          <h3 className="text-lg font-bold text-white mb-2">Auto-Insight AI</h3>
          <p className="text-sm text-slate-400">Deteksi tren, anomali, korelasi — narasi Bahasa Indonesia.</p>
        </div>
      </div>
    </main>
  );
}
