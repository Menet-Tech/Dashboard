import { StatusPill } from "../../components/ui";

export function RegistrationPage() {
  return (
    <section className="grid gap-6">
      <article className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Registrasi Mandiri</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-8">
          Halaman pendaftaran pelanggan baru secara mandiri melalui portal publik sedang disiapkan.
        </p>
        <div className="flex justify-center gap-3">
          <StatusPill label="Planned" tone="green" />
          <StatusPill label="v2.2" tone="slate" />
        </div>
      </article>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6">
          <h4 className="font-bold text-slate-700 mb-2">Lead Masuk</h4>
          <p className="text-2xl font-bold text-slate-400">0</p>
        </article>
        <article className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6">
          <h4 className="font-bold text-slate-700 mb-2">Konversi</h4>
          <p className="text-2xl font-bold text-slate-400">0%</p>
        </article>
      </div>
    </section>
  );
}
