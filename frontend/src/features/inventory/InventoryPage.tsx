import { useState, useEffect, useMemo } from "react";
import { Package, Search, Plus, Archive, ArchiveRestore, History, Trash2, Edit2, Loader2, ArrowRightLeft, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import { fetchInventoryItems, createInventoryItem, updateInventoryItem, deleteInventoryItem, fetchInventoryLogs, createInventoryLog } from "../../lib/api";
import type { InventoryItem, InventoryLog } from "../../types";
import { Button } from "../../components/ui/Button";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"items" | "logs">("items");
  const [search, setSearch] = useState("");

  const [sortField, setSortField] = useState<string | null>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Reset sorting state when activeTab changes
  useEffect(() => {
    setSortField("created_at");
    setSortDirection("desc");
  }, [activeTab]);

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedLogs = useMemo(() => {
    const list = logs || [];
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];

      const isNumericField = sortField === "quantity" || sortField === "item_id";
      if (aVal === null || aVal === undefined) aVal = isNumericField ? 0 : "";
      if (bVal === null || bVal === undefined) bVal = isNumericField ? 0 : "";

      if (isNumericField) {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).trim().toLowerCase();
      const bStr = String(bVal).trim().toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" })
        : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [logs, sortField, sortDirection]);

  const renderSortableHeader = (label: string, field: string) => {
    const isSorted = sortField === field;
    return (
      <th 
        className="px-6 py-4 font-bold select-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
        onClick={() => requestSort(field)}
      >
        <div className="inline-flex items-center gap-1.5">
          <span>{label}</span>
          {isSorted ? (
            sortDirection === "asc" ? (
              <ChevronUp size={12} className="text-indigo-600 dark:text-indigo-400 stroke-[3]" />
            ) : (
              <ChevronDown size={12} className="text-indigo-600 dark:text-indigo-400 stroke-[3]" />
            )
          ) : (
            <ArrowUpDown size={12} className="text-slate-300 dark:text-slate-600 opacity-50 transition-opacity" />
          )}
        </div>
      </th>
    );
  };

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLogFormOpen, setIsLogFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // Forms
  const [form, setForm] = useState({ name: "", description: "", category: "client", unit: "pcs", quantity: 0 });
  const [logForm, setLogForm] = useState({ itemId: 0, type: "out" as "in" | "out", quantity: 1, reference: "", notes: "" });

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "items") {
        const res = await fetchInventoryItems();
        setItems(res.data || []);
      } else {
        const res = await fetchInventoryLogs();
        setLogs(res.data || []);
      }
    } catch (err) {
      console.error(err);
      setItems([]);
      setLogs([]);
    }
    setLoading(false);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateInventoryItem(editingItem.id, form);
      } else {
        await createInventoryItem(form);
      }
      setIsFormOpen(false);
      loadData();
    } catch (err) {
      alert(String(err));
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm("Yakin ingin menghapus item ini?")) return;
    try {
      await deleteInventoryItem(id);
      loadData();
    } catch (err) {
      alert(String(err));
    }
  };

  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createInventoryLog(logForm.itemId, {
        type: logForm.type,
        quantity: logForm.quantity,
        reference: logForm.reference,
        notes: logForm.notes,
      });
      setIsLogFormOpen(false);
      if (activeTab === "items") loadData();
    } catch (err) {
      alert(String(err));
    }
  };

  const filteredItems = (items || []).filter(
    (i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 p-6 lg:p-8 bg-slate-50/50 dark:bg-slate-950 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 dark:text-white tracking-tight flex items-center gap-2">
              <Package className="text-indigo-600" />
              Inventaris Gudang
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Kelola stok barang, backbone, dan peralatan client.</p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLogForm({ itemId: items[0]?.id || 0, type: "out", quantity: 1, reference: "", notes: "" });
                setIsLogFormOpen(true);
              }}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 dark:text-slate-200 text-xs flex items-center gap-2"
            >
              <ArrowRightLeft size={16} />
              Catat Keluar/Masuk
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setEditingItem(null);
                setForm({ name: "", description: "", category: "client", unit: "pcs", quantity: 0 });
                setIsFormOpen(true);
              }}
              className="px-4 py-2 text-xs flex items-center gap-2"
            >
              <Plus size={16} />
              Item Baru
            </Button>
          </div>
        </header>

        <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800">
          <Button type="button" variant="outline"
            onClick={() => setActiveTab("items")}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === "items" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
          >
            Stok Barang
          </Button>
          <Button type="button" variant="outline"
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === "logs" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
          >
            Riwayat Transaksi
          </Button>
        </div>

        {activeTab === "items" && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
              <input
                type="text"
                placeholder="Cari item..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-600" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems.map(item => (
                  <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-card flex flex-col justify-between hover:border-indigo-500/50 transition-colors">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                          {item.category}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="p-1 px-1 h-auto text-slate-400 dark:text-slate-500 hover:text-indigo-600"
                            onClick={() => {
                              setEditingItem(item);
                              setForm({ name: item.name, description: item.description, category: item.category, unit: item.unit, quantity: item.quantity });
                              setIsFormOpen(true);
                            }}
                          >
                            <Edit2 size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="p-1 px-1 h-auto text-slate-400 dark:text-slate-500 hover:text-rose-600"
                            onClick={() => handleDeleteItem(item.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-50 dark:text-white text-lg">{item.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{item.description || "Tidak ada deskripsi"}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Stok Tersedia</span>
                        <span className={`text-xl font-black ${item.quantity <= 0 ? "text-rose-500" : "text-emerald-600"}`}>
                          {item.quantity} <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{item.unit}</span>
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setLogForm({ itemId: item.id, type: "out", quantity: 1, reference: "", notes: "" });
                          setIsLogFormOpen(true);
                        }}
                        className="w-8 h-8 rounded-full p-0 flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100"
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "logs" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-600" /></div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400">
                  <tr>
                    {renderSortableHeader("Waktu", "created_at")}
                    {renderSortableHeader("Item ID", "item_id")}
                    {renderSortableHeader("Tipe", "type")}
                    {renderSortableHeader("Jumlah", "quantity")}
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">Referensi</th>
                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">Oleh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="px-6 py-4">{new Date(log.created_at).toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4">#{log.item_id}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${log.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {log.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold">{log.type === 'in' ? '+' : '-'}{log.quantity}</td>
                      <td className="px-6 py-4">{log.reference || '-'}</td>
                      <td className="px-6 py-4 text-xs">{log.created_by}</td>
                    </tr>
                  ))}
                  {sortedLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">Belum ada transaksi.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Item Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
          <form onSubmit={handleSaveItem} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4 dark:text-white">{editingItem ? "Edit Item" : "Item Baru"}</h3>
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Nama Barang</span>
                <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Kategori</span>
                <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm">
                  <option value="client">Peralatan Client (ONT, Router)</option>
                  <option value="backbone">Backbone (Kabel, ODP, OLT)</option>
                  <option value="tools">Tools & Accessories</option>
                </select>
              </label>
              <div className="flex gap-4">
                <label className="block flex-1">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Satuan</span>
                  <input required type="text" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} placeholder="pcs, meter, box" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm" />
                </label>
                {!editingItem && (
                  <label className="block flex-1">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Stok Awal</span>
                    <input required type="number" min="0" value={form.quantity} onChange={e => setForm({...form, quantity: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm" />
                  </label>
                )}
              </div>
              <label className="block">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Deskripsi</span>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm" rows={3} />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>Batal</Button>
              <Button type="submit" variant="primary">Simpan Item</Button>
            </div>
          </form>
        </div>
      )}

      {/* Log Form Modal */}
      {isLogFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
          <form onSubmit={handleSaveLog} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold mb-4 dark:text-white">Catat Barang Keluar/Masuk</h3>
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Barang</span>
                <select required value={logForm.itemId} onChange={e => setLogForm({...logForm, itemId: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm">
                  <option value={0} disabled>Pilih Barang...</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} (Stok: {i.quantity} {i.unit})</option>)}
                </select>
              </label>
              <div className="flex gap-4">
                <label className="block flex-1">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Tipe</span>
                  <select required value={logForm.type} onChange={e => setLogForm({...logForm, type: e.target.value as any})} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm">
                    <option value="out">Keluar (-)</option>
                    <option value="in">Masuk (+)</option>
                  </select>
                </label>
                <label className="block flex-1">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Jumlah</span>
                  <input required type="number" min="1" value={logForm.quantity} onChange={e => setLogForm({...logForm, quantity: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Referensi / Tujuan</span>
                <input type="text" placeholder="Contoh: Pemasangan Client A" value={logForm.reference} onChange={e => setLogForm({...logForm, reference: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Catatan Tambahan</span>
                <textarea value={logForm.notes} onChange={e => setLogForm({...logForm, notes: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm" rows={2} />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="ghost" onClick={() => setIsLogFormOpen(false)}>Batal</Button>
              <Button type="submit" variant="primary">Simpan Transaksi</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
