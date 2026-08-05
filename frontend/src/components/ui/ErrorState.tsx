import { Button } from "./Button";
type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ title = "Terjadi Kesalahan", message, onRetry }: ErrorStateProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex flex-col items-center text-center">
      <div className="text-red-500 mb-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      </div>
      <h3 className="text-lg font-semibold text-red-900 mb-2">{title}</h3>
      <p className="text-sm text-red-700 max-w-md mx-auto mb-4">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="bg-white dark:bg-slate-900 border border-red-200 text-red-700 hover:bg-red-50 font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors"
        >
          Coba Lagi
        </button>
      )}
    </div>
  );
}
