import { StatusPill } from "../../components/ui";

export function TicketsPage() {
  return (
    <section className="grid gap-6">
      <article className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Manajemen Tiket</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-8">
          Fitur helpdesk untuk menangani keluhan pelanggan dan request teknis sedang dalam tahap pengembangan.
        </p>
        <div className="flex justify-center gap-3">
          <StatusPill label="Coming Soon" tone="gold" />
          <StatusPill label="v2.1" tone="slate" />
        </div>
      </article>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <article className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6">
          <h4 className="font-bold text-slate-700 mb-2">Tiket Aktif</h4>
          <p className="text-2xl font-bold text-slate-400">0</p>
        </article>
        <article className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6">
          <h4 className="font-bold text-slate-700 mb-2">Selesai Hari Ini</h4>
          <p className="text-2xl font-bold text-slate-400">0</p>
        </article>
        <article className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6">
          <h4 className="font-bold text-slate-700 mb-2">Avg. Response</h4>
          <p className="text-2xl font-bold text-slate-400">-</p>
        </article>
      </div>
    </section>
  );
}
