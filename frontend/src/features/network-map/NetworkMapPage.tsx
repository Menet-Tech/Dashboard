import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  Map,
  Plus,
  Trash2,
  Settings,
  Save,
  RefreshCw,
  Edit,
  X,
  Layers,
  Move,
  Link,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  fetchNodes,
  fetchEdges,
  fetchMapSettings,
  updateMapSettings,
  resetMapSettings,
  syncMappingData,
  resetMappingData,
} from "../../lib/api";
import type { MapNode, MapEdge, MapSettings } from "../../types";

const DEFAULT_MAP_CENTER: [number, number] = [-6.2088, 106.8456];
const DEFAULT_MAP_ZOOM = 13;
const DEFAULT_MIN_ZOOM = 5;
const DEFAULT_MAX_ZOOM = 18;

const parseFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const parseLatitude = (value: unknown, fallback = DEFAULT_MAP_CENTER[0]) =>
  clampNumber(parseFiniteNumber(value, fallback), -90, 90);

const parseLongitude = (value: unknown, fallback = DEFAULT_MAP_CENTER[1]) =>
  clampNumber(parseFiniteNumber(value, fallback), -180, 180);

const parseZoom = (value: unknown, fallback = DEFAULT_MAP_ZOOM) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMapZoomRange = (settings: MapSettings | null) => {
  let minZoom = parseZoom(settings?.max_zoom_out, DEFAULT_MIN_ZOOM);
  let maxZoom = parseZoom(settings?.max_zoom_in, DEFAULT_MAX_ZOOM);
  minZoom = clampNumber(minZoom, 0, 22);
  maxZoom = clampNumber(maxZoom, 0, 22);
  if (minZoom > maxZoom) {
    [minZoom, maxZoom] = [maxZoom, minZoom];
  }
  return { minZoom, maxZoom };
};

// Helper to compute distance in meters between two lat/lng coordinates (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c); // in meters
};

// Component to dynamically re-center and zoom Leaflet map
function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!Number.isFinite(center[0]) || !Number.isFinite(center[1]) || !Number.isFinite(zoom)) {
      return;
    }
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// Map events handler to detect clicks on the map (for adding nodes)
function MapEventsHandler({ onMapClick }: { onMapClick: (e: L.LeafletMouseEvent) => void }) {
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useMapEvents({
    click: (e) => {
      onMapClickRef.current(e);
    },
  });
  return null;
}

type NetworkMapPageProps = {
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
};

export function NetworkMapPage({ pushSuccess, pushError }: NetworkMapPageProps) {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [settings, setSettings] = useState<MapSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editing state
  const [activeTool, setActiveTool] = useState<"select" | "add-node" | "add-edge">("select");
  const [firstNodeForEdge, setFirstNodeForEdge] = useState<MapNode | null>(null);

  // Modals state
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
  const [isEdgeModalOpen, setIsEdgeModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Form states
  const [editingNode, setEditingNode] = useState<MapNode | null>(null);
  const [editingEdge, setEditingEdge] = useState<MapEdge | null>(null);

  // Form inputs for Node
  const [nodeIdInput, setNodeIdInput] = useState("");
  const [nodeNameInput, setNodeNameInput] = useState("");
  const [nodeTypeInput, setNodeTypeInput] = useState<"server" | "odc" | "odp" | "ont">("ont");
  const [nodeLatInput, setNodeLatInput] = useState(0);
  const [nodeLngInput, setNodeLngInput] = useState(0);
  const [nodeCapacityInput, setNodeCapacityInput] = useState("");
  const [nodeSplitterInput, setNodeSplitterInput] = useState("");
  const [nodePppoeInput, setNodePppoeInput] = useState("");
  const [nodeSnInput, setNodeSnInput] = useState("");
  const [nodeNotesInput, setNodeNotesInput] = useState("");

  // Form inputs for Edge
  const [edgeIdInput, setEdgeIdInput] = useState("");
  const [edgeSourceInput, setEdgeSourceInput] = useState("");
  const [edgeTargetInput, setEdgeTargetInput] = useState("");
  const [edgeFiberTypeInput, setEdgeFiberTypeInput] = useState("feeder");
  const [edgeDistanceInput, setEdgeDistanceInput] = useState("");
  const [edgeNotesInput, setEdgeNotesInput] = useState("");

  // Map settings inputs
  const [centerLatInput, setCenterLatInput] = useState("-6.2088");
  const [centerLngInput, setCenterLngInput] = useState("106.8456");
  const [defaultZoomInput, setDefaultZoomInput] = useState("13");
  const [maxZoomInInput, setMaxZoomInInput] = useState("18");
  const [maxZoomOutInput, setMaxZoomOutInput] = useState("5");

  // Load all map data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nodesRes, edgesRes, settingsRes] = await Promise.all([
        fetchNodes(),
        fetchEdges(),
        fetchMapSettings(),
      ]);
      // Normalize API responses: some endpoints return { data: [...] },
      // while others return the array directly. Ensure we always store arrays.
      const normalizeArray = <T,>(val: any): T[] => {
        if (!val) return [];
        if (Array.isArray(val)) return val as T[];
        if (typeof val === "object" && Array.isArray((val as any).data)) return (val as any).data as T[];
        return [];
      };

      setNodes(normalizeArray<MapNode>(nodesRes));
      setEdges(normalizeArray<MapEdge>(edgesRes));
      setSettings(settingsRes);

      // Pre-fill map settings inputs
      setCenterLatInput(settingsRes.center_lat);
      setCenterLngInput(settingsRes.center_lng);
      setDefaultZoomInput(settingsRes.default_zoom);
      setMaxZoomInInput(settingsRes.max_zoom_in);
      setMaxZoomOutInput(settingsRes.max_zoom_out);

      setIsDirty(false);
    } catch {
      pushError("Gagal memuat data peta jaringan.");
    } finally {
      setLoading(false);
    }
  }, [pushError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle map click when "add-node" tool is active
  const handleMapClick = (e: L.LeafletMouseEvent) => {
    if (activeTool !== "add-node") return;

    setEditingNode(null);
    setNodeIdInput(`NODE-${Date.now().toString().slice(-6)}`);
    setNodeNameInput("");
    setNodeTypeInput("ont");
    setNodeLatInput(e.latlng.lat);
    setNodeLngInput(e.latlng.lng);
    setNodeCapacityInput("");
    setNodeSplitterInput("");
    setNodePppoeInput("");
    setNodeSnInput("");
    setNodeNotesInput("");

    setIsNodeModalOpen(true);
  };

  // Click on a node marker
  const handleNodeClick = (node: MapNode) => {
    if (activeTool === "add-edge") {
      if (!firstNodeForEdge) {
        setFirstNodeForEdge(node);
        pushSuccess(`Pilih node tujuan untuk menghubungkan dari "${node.name}"`);
      } else {
        if (firstNodeForEdge.node_id === node.node_id) {
          pushError("Node asal dan tujuan tidak boleh sama.");
          return;
        }
        // Auto prefill edge details
        setEditingEdge(null);
        setEdgeIdInput(`LINE-${Date.now().toString().slice(-6)}`);
        setEdgeSourceInput(firstNodeForEdge.node_id);
        setEdgeTargetInput(node.node_id);
        setEdgeFiberTypeInput(
          firstNodeForEdge.type === "server" ? "feeder" : "distribution"
        );
        // Compute distance automatically
        const dist = calculateDistance(
          parseLatitude(firstNodeForEdge.latitude),
          parseLongitude(firstNodeForEdge.longitude),
          parseLatitude(node.latitude),
          parseLongitude(node.longitude)
        );
        setEdgeDistanceInput(String(dist));
        setEdgeNotesInput("");

        setIsEdgeModalOpen(true);
      }
    }
  };

  // Node marker dragged
  const handleNodeDragEnd = (nodeId: string, event: L.DragEndEvent) => {
    const marker = event.target as L.Marker;
    const position = marker.getLatLng();

    setNodes((prev) =>
      prev.map((n) =>
        n.node_id === nodeId
          ? { ...n, latitude: position.lat, longitude: position.lng }
          : n
      )
    );
    setIsDirty(true);
  };

  // Save Node modal submission
  const handleSaveNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeIdInput.trim() || !nodeNameInput.trim()) {
      pushError("ID Node dan Nama wajib diisi.");
      return;
    }

    const capacityNum = nodeCapacityInput ? parseInt(nodeCapacityInput, 10) : undefined;

    if (editingNode) {
      // Edit mode
      setNodes((prev) =>
        prev.map((n) =>
          n.node_id === editingNode.node_id
            ? {
                ...n,
                node_id: nodeIdInput.trim(),
                name: nodeNameInput.trim(),
                type: nodeTypeInput,
                latitude: nodeLatInput,
                longitude: nodeLngInput,
                capacity: capacityNum,
                splitter: nodeSplitterInput.trim() || undefined,
                pppoe: nodePppoeInput.trim() || undefined,
                serialnumber: nodeSnInput.trim() || undefined,
                notes: nodeNotesInput.trim() || undefined,
              }
            : n
        )
      );
      // Update referencing edges if the node_id changed
      if (editingNode.node_id !== nodeIdInput.trim()) {
        setEdges((prev) =>
          prev.map((edge) => {
            let src = edge.source;
            let tgt = edge.target;
            if (edge.source === editingNode.node_id) src = nodeIdInput.trim();
            if (edge.target === editingNode.node_id) tgt = nodeIdInput.trim();
            return { ...edge, source: src, target: tgt };
          })
        );
      }
      pushSuccess("Node berhasil diperbarui (Draft).");
    } else {
      // Create mode
      if (nodes.some((n) => n.node_id === nodeIdInput.trim())) {
        pushError("ID Node sudah digunakan.");
        return;
      }
      const newNode: MapNode = {
        node_id: nodeIdInput.trim(),
        name: nodeNameInput.trim(),
        type: nodeTypeInput,
        latitude: nodeLatInput,
        longitude: nodeLngInput,
        capacity: capacityNum,
        splitter: nodeSplitterInput.trim() || undefined,
        pppoe: nodePppoeInput.trim() || undefined,
        serialnumber: nodeSnInput.trim() || undefined,
        notes: nodeNotesInput.trim() || undefined,
      };
      setNodes((prev) => [...prev, newNode]);
      pushSuccess("Node baru berhasil ditambahkan (Draft).");
    }

    setIsNodeModalOpen(false);
    setIsDirty(true);
    setActiveTool("select");
  };

  // Save Edge modal submission
  const handleSaveEdge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!edgeIdInput.trim() || !edgeSourceInput || !edgeTargetInput) {
      pushError("ID Kabel, Asal, dan Tujuan wajib diisi.");
      return;
    }

    const distNum = edgeDistanceInput ? parseFloat(edgeDistanceInput) : undefined;

    if (editingEdge) {
      setEdges((prev) =>
        prev.map((edge) =>
          edge.edge_id === editingEdge.edge_id
            ? {
                ...edge,
                edge_id: edgeIdInput.trim(),
                source: edgeSourceInput,
                target: edgeTargetInput,
                fiber_type: edgeFiberTypeInput,
                distance: distNum,
                notes: edgeNotesInput.trim() || undefined,
              }
            : edge
        )
      );
      pushSuccess("Kabel berhasil diperbarui (Draft).");
    } else {
      if (edges.some((edge) => edge.edge_id === edgeIdInput.trim())) {
        pushError("ID Kabel sudah digunakan.");
        return;
      }
      const newEdge: MapEdge = {
        edge_id: edgeIdInput.trim(),
        source: edgeSourceInput,
        target: edgeTargetInput,
        fiber_type: edgeFiberTypeInput,
        distance: distNum,
        notes: edgeNotesInput.trim() || undefined,
      };
      setEdges((prev) => [...prev, newEdge]);
      pushSuccess("Kabel baru berhasil ditambahkan (Draft).");
    }

    setIsEdgeModalOpen(false);
    setIsDirty(true);
    setFirstNodeForEdge(null);
    setActiveTool("select");
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    if (!confirm(`Hapus node "${nodeId}"? Semua kabel yang terhubung juga akan dihapus.`)) return;

    setNodes((prev) => prev.filter((n) => n.node_id !== nodeId));
    setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setIsDirty(true);
    pushSuccess("Node dihapus (Draft).");
  };

  // Delete edge
  const handleDeleteEdge = (edgeId: string) => {
    if (!confirm(`Hapus kabel "${edgeId}"?`)) return;

    setEdges((prev) => prev.filter((edge) => edge.edge_id !== edgeId));
    setIsDirty(true);
    pushSuccess("Kabel dihapus (Draft).");
  };

  // Sync data to DB
  const handleSync = async () => {
    setSaving(true);
    try {
      await syncMappingData({ nodes, edges });
      pushSuccess("Peta jaringan berhasil disinkronisasi ke server!");
      setIsDirty(false);
    } catch {
      pushError("Gagal menyinkronkan data peta jaringan.");
    } finally {
      setSaving(false);
    }
  };

  // Reset all mapping data on database
  const handleResetAll = async () => {
    if (!confirm("⚠️ Peringatan: Tindakan ini akan menghapus SELURUH node dan kabel di peta jaringan secara permanen. Lanjutkan?")) return;

    setSaving(true);
    try {
      await resetMappingData();
      pushSuccess("Seluruh data peta jaringan berhasil direset.");
      void loadData();
    } catch {
      pushError("Gagal mereset data peta jaringan.");
    } finally {
      setSaving(false);
    }
  };

  // Save map settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: MapSettings = {
        center_lat: centerLatInput.trim(),
        center_lng: centerLngInput.trim(),
        default_zoom: defaultZoomInput.trim(),
        max_zoom_in: maxZoomInInput.trim(),
        max_zoom_out: maxZoomOutInput.trim(),
      };
      await updateMapSettings(payload);
      setSettings(payload);
      pushSuccess("Pengaturan peta berhasil diperbarui.");
      setIsSettingsModalOpen(false);
    } catch {
      pushError("Gagal menyimpan pengaturan peta.");
    }
  };

  // Reset map settings to default
  const handleResetSettings = async () => {
    if (!confirm("Reset pengaturan peta ke default Jakarta?")) return;
    try {
      const res = await resetMapSettings();
      setSettings(res);
      setCenterLatInput(res.center_lat);
      setCenterLngInput(res.center_lng);
      setDefaultZoomInput(res.default_zoom);
      setMaxZoomInInput(res.max_zoom_in);
      setMaxZoomOutInput(res.max_zoom_out);
      pushSuccess("Pengaturan peta direset ke default.");
      setIsSettingsModalOpen(false);
    } catch {
      pushError("Gagal mereset pengaturan peta.");
    }
  };

  // Custom marker icon creation with DivIcon for modern visual styling
  const createCustomIcon = (type: "server" | "odc" | "odp" | "ont", name: string) => {
    const bgColors = {
      server: "bg-indigo-600 ring-4 ring-indigo-200 text-white",
      odc: "bg-amber-500 ring-4 ring-amber-200 text-white",
      odp: "bg-emerald-500 ring-4 ring-emerald-200 text-white",
      ont: "bg-sky-500 ring-4 ring-sky-200 text-white",
    };
    const emojis = {
      server: "🖥️",
      odc: "📦",
      odp: "🔌",
      ont: "📡",
    };
    return L.divIcon({
      html: `
        <div class="flex flex-col items-center select-none">
          <div class="w-8 h-8 rounded-full ${bgColors[type]} flex items-center justify-center shadow-lg transform transition hover:scale-110 duration-200">
            <span class="text-sm">${emojis[type]}</span>
          </div>
          <div class="mt-1 px-1.5 py-0.5 bg-white border border-slate-200 dark:border-slate-800 text-[9px] font-bold rounded shadow text-slate-800 dark:text-slate-200 max-w-[80px] truncate text-center">
            ${name}
          </div>
        </div>
      `,
      className: "custom-map-icon",
      iconSize: [80, 52],
      iconAnchor: [40, 24],
    });
  };

  // Helper to resolve edge coordinates from nodes
  const resolveEdgePositions = (edge: MapEdge): [number, number][] => {
    const srcNode = nodes.find((n) => n.node_id === edge.source);
    const tgtNode = nodes.find((n) => n.node_id === edge.target);
    if (!srcNode || !tgtNode) return [];
    return [
      [parseLatitude(srcNode.latitude), parseLongitude(srcNode.longitude)],
      [parseLatitude(tgtNode.latitude), parseLongitude(tgtNode.longitude)],
    ];
  };

  // Resolve fiber line color
  const getFiberColor = (type?: string) => {
    switch (type) {
      case "feeder":
        return "#ef4444"; // Red
      case "distribution":
        return "#3b82f6"; // Blue
      case "drop":
        return "#10b981"; // Emerald
      default:
        return "#f97316"; // Orange
    }
  };

  // Map settings memoized for the Leaflet component
  const mapCenter = useMemo<[number, number]>(() => {
    if (!settings) return DEFAULT_MAP_CENTER;
    return [parseLatitude(settings.center_lat), parseLongitude(settings.center_lng)];
  }, [settings]);

  const mapZoomRange = useMemo(() => normalizeMapZoomRange(settings), [settings]);

  const mapZoom = useMemo<number>(() => {
    const rawZoom = settings ? parseZoom(settings.default_zoom, DEFAULT_MAP_ZOOM) : DEFAULT_MAP_ZOOM;
    return clampNumber(rawZoom, mapZoomRange.minZoom, mapZoomRange.maxZoom);
  }, [settings, mapZoomRange]);

  if (loading && !settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-400 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="text-sm font-medium">Memuat Peta Jaringan Fiber...</span>
      </div>
    );
  }

  return (
    <section className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in">
      {/* Sidebar Editor */}
      <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[500px]">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
            <Map className="w-5 h-5 text-indigo-600" />
            Peta Jaringan Fiber
          </h2>

          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Kelola node infrastruktur fiber optik dan penyambungan kabel secara visual. Seret penanda di peta untuk memindahkan lokasi.
          </p>

          {/* Tools Menu */}
          <div className="grid gap-2.5 mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveTool("select");
                setFirstNodeForEdge(null);
              }}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                activeTool === "select"
                  ? "bg-slate-100 border-slate-300 text-slate-900 shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Move className="w-4 h-4 text-indigo-500" />
              Navigasi & Pindah Node
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTool("add-node");
                setFirstNodeForEdge(null);
                pushSuccess("Klik pada peta untuk menempatkan node baru.");
              }}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                activeTool === "add-node"
                  ? "bg-slate-100 border-slate-300 text-slate-900 shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Plus className="w-4 h-4 text-emerald-500" />
              Tambah Node Baru
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTool("add-edge");
                setFirstNodeForEdge(null);
                pushSuccess("Pilih node asal dengan mengklik penandanya.");
              }}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                activeTool === "add-edge"
                  ? "bg-slate-100 border-slate-300 text-slate-900 shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Link className="w-4 h-4 text-amber-500" />
              Tambah Hubungan Kabel
            </button>
          </div>

          {/* Quick Stats */}
          <div className="border-t border-slate-100 pt-5 text-xs text-slate-500 grid grid-cols-2 gap-4">
            <div>
              <p className="font-semibold text-slate-400">TOTAL NODE</p>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{nodes.length}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-400">TOTAL KABEL</p>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{edges.length}</p>
            </div>
          </div>
        </div>

        {/* Sync Status & Action Bar */}
        <div className="border-t border-slate-100 pt-5 flex flex-col gap-3">
          {isDirty && (
            <div className="bg-amber-50 text-amber-800 border border-amber-100 rounded-xl px-3 py-2.5 text-xs font-semibold flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 bg-amber-500 rounded-full" />
              Ada perubahan draf yang belum disimpan!
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={saving || !isDirty}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow"
            >
              <Save className="w-4 h-4" />
              {saving ? "Menyimpan..." : "Simpan Peta"}
            </button>
            <button
              type="button"
              title="Reset Semua ke DB"
              onClick={() => void loadData()}
              disabled={saving}
              className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 py-2.5 px-3 rounded-xl transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex justify-between mt-1">
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              <Settings className="w-3.5 h-3.5" />
              Pengaturan Peta
            </button>

            <button
              type="button"
              onClick={() => void handleResetAll()}
              className="text-xs text-red-600 hover:text-red-800 font-semibold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Hapus Semua
            </button>
          </div>
        </div>
      </div>

      {/* Leaflet Interactive Map Container */}
      <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm min-h-[550px] relative">
        {activeTool !== "select" && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[999] bg-indigo-600 text-white font-semibold text-xs px-4 py-2 rounded-full shadow-lg border border-indigo-500 flex items-center gap-2">
            <Info className="w-3.5 h-3.5" />
            {activeTool === "add-node" && "Klik di peta untuk menambahkan marker baru."}
            {activeTool === "add-edge" &&
              (!firstNodeForEdge
                ? "Pilih node asal dengan mengklik penanda di peta."
                : `Menghubungkan dari: "${firstNodeForEdge.name}". Klik node tujuan.`)}
            <button
              type="button"
              onClick={() => {
                setActiveTool("select");
                setFirstNodeForEdge(null);
              }}
              className="bg-indigo-700 hover:bg-indigo-800 p-0.5 rounded-full"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          maxZoom={mapZoomRange.maxZoom}
          minZoom={mapZoomRange.minZoom}
          className="w-full h-full min-h-[550px]"
          doubleClickZoom={false}
        >
          <ChangeView center={mapCenter} zoom={mapZoom} />
          <MapEventsHandler onMapClick={handleMapClick} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Render Cable Lines (Edges) */}
          {edges.map((edge) => {
            const positions = resolveEdgePositions(edge);
            if (positions.length < 2) return null;

            return (
              <Polyline
                key={edge.edge_id}
                positions={positions}
                color={getFiberColor(edge.fiber_type)}
                weight={3}
                opacity={0.8}
              >
                <Popup>
                  <div className="p-1 text-slate-800">
                    <p className="font-bold text-xs border-b pb-1 mb-1">🔌 Kabel Fiber: {edge.edge_id}</p>
                    <p className="text-[11px] mb-0.5"><strong>Asal:</strong> {edge.source}</p>
                    <p className="text-[11px] mb-0.5"><strong>Tujuan:</strong> {edge.target}</p>
                    <p className="text-[11px] mb-0.5"><strong>Tipe:</strong> <span className="uppercase font-semibold text-indigo-600">{edge.fiber_type}</span></p>
                    <p className="text-[11px] mb-2"><strong>Jarak:</strong> {edge.distance ? `${edge.distance} m` : "—"}</p>
                    {edge.notes && <p className="text-[10px] italic bg-slate-50 p-1 border rounded text-slate-500 mb-2">{edge.notes}</p>}

                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEdge(edge);
                          setEdgeIdInput(edge.edge_id);
                          setEdgeSourceInput(edge.source);
                          setEdgeTargetInput(edge.target);
                          setEdgeFiberTypeInput(edge.fiber_type || "feeder");
                          setEdgeDistanceInput(String(edge.distance || ""));
                          setEdgeNotesInput(edge.notes || "");
                          setIsEdgeModalOpen(true);
                        }}
                        className="text-[10px] text-indigo-600 hover:underline font-semibold flex items-center gap-0.5"
                      >
                        <Edit className="w-2.5 h-2.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEdge(edge.edge_id)}
                        className="text-[10px] text-red-600 hover:underline font-semibold flex items-center gap-0.5"
                      >
                        <Trash2 className="w-2.5 h-2.5" /> Hapus
                      </button>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

          {/* Render Infrastructure Markers (Nodes) */}
          {nodes.map((node) => (
            <Marker
              key={node.node_id}
              position={[parseLatitude(node.latitude), parseLongitude(node.longitude)]}
              icon={createCustomIcon(node.type, node.name)}
              draggable={activeTool === "select"}
              eventHandlers={{
                click: () => handleNodeClick(node),
                dragend: (e) => handleNodeDragEnd(node.node_id, e),
              }}
            >
              <Popup>
                <div className="p-1 text-slate-800 min-w-[150px]">
                  <p className="font-bold text-xs border-b pb-1 mb-1.5 flex items-center gap-1.5 capitalize">
                    {node.type === "server" ? "🖥️" : node.type === "odc" ? "📦" : node.type === "odp" ? "🔌" : "📡"}{" "}
                    {node.type}: {node.name}
                  </p>
                  <p className="text-[11px] mb-0.5"><strong>Node ID:</strong> {node.node_id}</p>
                  {node.capacity !== undefined && (
                    <p className="text-[11px] mb-0.5"><strong>Kapasitas Port:</strong> {node.capacity}</p>
                  )}
                  {node.splitter && (
                    <p className="text-[11px] mb-0.5"><strong>Splitter Rasio:</strong> {node.splitter}</p>
                  )}
                  {node.pppoe && (
                    <p className="text-[11px] mb-0.5"><strong>PPPoE Username:</strong> {node.pppoe}</p>
                  )}
                  {node.serialnumber && (
                    <p className="text-[11px] mb-0.5"><strong>Serial Number:</strong> {node.serialnumber}</p>
                  )}
                  {node.notes && (
                    <p className="text-[10px] italic bg-slate-50 p-1 border rounded text-slate-500 mb-2 mt-1">{node.notes}</p>
                  )}

                  <div className="flex gap-2.5 mt-2 border-t pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNode(node);
                        setNodeIdInput(node.node_id);
                        setNodeNameInput(node.name);
                        setNodeTypeInput(node.type);
                        setNodeLatInput(node.latitude);
                        setNodeLngInput(node.longitude);
                        setNodeCapacityInput(node.capacity ? String(node.capacity) : "");
                        setNodeSplitterInput(node.splitter || "");
                        setNodePppoeInput(node.pppoe || "");
                        setNodeSnInput(node.serialnumber || "");
                        setNodeNotesInput(node.notes || "");
                        setIsNodeModalOpen(true);
                      }}
                      className="text-[10px] text-indigo-600 hover:underline font-semibold flex items-center gap-0.5"
                    >
                      <Edit className="w-2.5 h-2.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNode(node.node_id)}
                      className="text-[10px] text-red-600 hover:underline font-semibold flex items-center gap-0.5"
                    >
                      <Trash2 className="w-2.5 h-2.5" /> Hapus
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* --- ADD / EDIT NODE MODAL --- */}
      {isNodeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveNode}
            className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl w-full max-w-md animate-in"
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingNode ? `Edit Node: ${editingNode.node_id}` : "Tambah Node Infrastruktur"}
              </h3>
              <button
                type="button"
                onClick={() => setIsNodeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid gap-3.5 max-h-[400px] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ID NODE (KODE)</label>
                <input
                  type="text"
                  required
                  className="w-full text-sm px-3 py-2 border rounded-xl"
                  value={nodeIdInput}
                  onChange={(e) => setNodeIdInput(e.target.value)}
                  placeholder="Contoh: ODP-MERDEKA-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">TIPE INFRASTRUKTUR</label>
                  <select
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={nodeTypeInput}
                    onChange={(e) => setNodeTypeInput(e.target.value as any)}
                  >
                    <option value="server">🖥️ Server (Headend)</option>
                    <option value="odc">📦 ODC (Cabinet)</option>
                    <option value="odp">🔌 ODP (Splitter Box)</option>
                    <option value="ont">📡 ONT (Customer)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">NAMA NODE</label>
                  <input
                    type="text"
                    required
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={nodeNameInput}
                    onChange={(e) => setNodeNameInput(e.target.value)}
                    placeholder="Contoh: ODP Sudirman 03"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">LATITUDE</label>
                  <input
                    type="number"
                    step="any"
                    required
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={nodeLatInput}
                    onChange={(e) => setNodeLatInput(parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">LONGITUDE</label>
                  <input
                    type="number"
                    step="any"
                    required
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={nodeLngInput}
                    onChange={(e) => setNodeLngInput(parseFloat(e.target.value))}
                  />
                </div>
              </div>

              {nodeTypeInput === "server" && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">KAPASITAS CORES / PORT</label>
                  <input
                    type="number"
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={nodeCapacityInput}
                    onChange={(e) => setNodeCapacityInput(e.target.value)}
                    placeholder="Contoh: 96"
                  />
                </div>
              )}

              {nodeTypeInput === "odc" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">KAPASITAS (IN/OUT)</label>
                    <input
                      type="number"
                      className="w-full text-sm px-3 py-2 border rounded-xl"
                      value={nodeCapacityInput}
                      onChange={(e) => setNodeCapacityInput(e.target.value)}
                      placeholder="Contoh: 288"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">SPLITTER RASIO</label>
                    <input
                      type="text"
                      className="w-full text-sm px-3 py-2 border rounded-xl"
                      value={nodeSplitterInput}
                      onChange={(e) => setNodeSplitterInput(e.target.value)}
                      placeholder="Contoh: 1:4"
                    />
                  </div>
                </div>
              )}

              {nodeTypeInput === "odp" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">KAPASITAS PORT</label>
                    <input
                      type="number"
                      className="w-full text-sm px-3 py-2 border rounded-xl"
                      value={nodeCapacityInput}
                      onChange={(e) => setNodeCapacityInput(e.target.value)}
                      placeholder="Contoh: 8 atau 16"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">SPLITTER RASIO</label>
                    <input
                      type="text"
                      className="w-full text-sm px-3 py-2 border rounded-xl"
                      value={nodeSplitterInput}
                      onChange={(e) => setNodeSplitterInput(e.target.value)}
                      placeholder="Contoh: 1:8"
                    />
                  </div>
                </div>
              )}

              {nodeTypeInput === "ont" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">PPPoE USERNAME</label>
                    <input
                      type="text"
                      className="w-full text-sm px-3 py-2 border rounded-xl"
                      value={nodePppoeInput}
                      onChange={(e) => setNodePppoeInput(e.target.value)}
                      placeholder="Contoh: user_pppoe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">SERIAL NUMBER (ONT)</label>
                    <input
                      type="text"
                      className="w-full text-sm px-3 py-2 border rounded-xl"
                      value={nodeSnInput}
                      onChange={(e) => setNodeSnInput(e.target.value)}
                      placeholder="Contoh: ZTEGC12345"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">CATATAN / INFORMASI TAMBAHAN</label>
                <textarea
                  className="w-full text-sm px-3 py-2 border rounded-xl"
                  rows={2}
                  value={nodeNotesInput}
                  onChange={(e) => setNodeNotesInput(e.target.value)}
                  placeholder="Catatan pengerjaan atau kondisi fisik node..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4 mt-5">
              <button
                type="button"
                onClick={() => setIsNodeModalOpen(false)}
                className="text-slate-600 hover:bg-slate-100 text-sm font-semibold py-2 px-4 rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2 px-4 rounded-xl transition shadow"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- ADD / EDIT EDGE MODAL --- */}
      {isEdgeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdge}
            className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl w-full max-w-md animate-in"
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingEdge ? `Edit Kabel: ${editingEdge.edge_id}` : "Tambah Sambungan Kabel"}
              </h3>
              <button
                type="button"
                onClick={() => setIsEdgeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ID KABEL (KODE)</label>
                <input
                  type="text"
                  required
                  className="w-full text-sm px-3 py-2 border rounded-xl"
                  value={edgeIdInput}
                  onChange={(e) => setEdgeIdInput(e.target.value)}
                  placeholder="Contoh: FIB-SERVER-ODC"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">NODE ASAL</label>
                  <select
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={edgeSourceInput}
                    onChange={(e) => setEdgeSourceInput(e.target.value)}
                  >
                    <option value="">-- Pilih Asal --</option>
                    {nodes.map((n) => (
                      <option key={n.node_id} value={n.node_id}>
                        {n.name} ({n.node_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">NODE TUJUAN</label>
                  <select
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={edgeTargetInput}
                    onChange={(e) => setEdgeTargetInput(e.target.value)}
                  >
                    <option value="">-- Pilih Tujuan --</option>
                    {nodes.map((n) => (
                      <option key={n.node_id} value={n.node_id}>
                        {n.name} ({n.node_id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">TIPE FIBER</label>
                  <select
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={edgeFiberTypeInput}
                    onChange={(e) => setEdgeFiberTypeInput(e.target.value)}
                  >
                    <option value="feeder">🔴 Feeder (Server ke ODC)</option>
                    <option value="distribution">🔵 Distribution (ODC ke ODP)</option>
                    <option value="drop">🟢 Drop (ODP ke ONT)</option>
                    <option value="other">🟠 Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ESTIMASI JARAK (METER)</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={edgeDistanceInput}
                    onChange={(e) => setEdgeDistanceInput(e.target.value)}
                    placeholder="Contoh: 150"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">CATATAN / KONDISI KABEL</label>
                <textarea
                  className="w-full text-sm px-3 py-2 border rounded-xl"
                  rows={2}
                  value={edgeNotesInput}
                  onChange={(e) => setEdgeNotesInput(e.target.value)}
                  placeholder="Contoh: Core 1 red, redup di ODP..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4 mt-5">
              <button
                type="button"
                onClick={() => setIsEdgeModalOpen(false)}
                className="text-slate-600 hover:bg-slate-100 text-sm font-semibold py-2 px-4 rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2 px-4 rounded-xl transition shadow"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MAP SETTINGS MODAL --- */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveSettings}
            className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl w-full max-w-md animate-in"
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                Pengaturan Peta Jaringan
              </h3>
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">LATITUDE DEFAULTS</label>
                  <input
                    type="text"
                    required
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={centerLatInput}
                    onChange={(e) => setCenterLatInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">LONGITUDE DEFAULTS</label>
                  <input
                    type="text"
                    required
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={centerLngInput}
                    onChange={(e) => setCenterLngInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ZOOM DEFAULT</label>
                  <input
                    type="number"
                    required
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={defaultZoomInput}
                    onChange={(e) => setDefaultZoomInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">MAX ZOOM</label>
                  <input
                    type="number"
                    required
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={maxZoomInInput}
                    onChange={(e) => setMaxZoomInInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">MIN ZOOM</label>
                  <input
                    type="number"
                    required
                    className="w-full text-sm px-3 py-2 border rounded-xl"
                    value={maxZoomOutInput}
                    onChange={(e) => setMaxZoomOutInput(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between border-t pt-4 mt-5">
              <button
                type="button"
                onClick={() => void handleResetSettings()}
                className="text-red-600 hover:bg-red-50 text-sm font-semibold py-2 px-3 rounded-xl transition"
              >
                Reset ke Default
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="text-slate-600 hover:bg-slate-100 text-sm font-semibold py-2 px-4 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2 px-4 rounded-xl transition shadow"
                >
                  Simpan
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
