import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Button } from "../../components/ui/Button";
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
  AlertTriangle,
  Lock,
  Unlock,
} from "lucide-react";
import {
  fetchNodes,
  fetchEdges,
  fetchMapSettings,
  updateMapSettings,
  resetMapSettings,
  syncMappingData,
  resetMappingData,
  fetchGacsDevices,
  updateCustomer,
  assignCustomerOdp,
  type GacsDevice,
} from "../../lib/api";

import type { MapNode, MapEdge, MapSettings, CustomerItem, OdpItem } from "../../types";

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
  const map = useMap();
  useEffect(() => {
    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
  }, [map, onMapClick]);
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
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState("");

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
  const [edgeCountsAsPort, setEdgeCountsAsPort] = useState(false);
  // Port input when manually connecting an ONT that has no ODP assignment yet
  const [edgeOdpPortInput, setEdgeOdpPortInput] = useState("");
  // Tracks whether the edge being drawn is a new ODP→ONT link needing a port assignment
  const [pendingOdpAssignment, setPendingOdpAssignment] = useState<{ customerId: number; odpId: number } | null>(null);

  // Map settings inputs
  const [centerLatInput, setCenterLatInput] = useState("-6.2088");
  const [centerLngInput, setCenterLngInput] = useState("106.8456");
  const [defaultZoomInput, setDefaultZoomInput] = useState("13");
  const [maxZoomInInput, setMaxZoomInInput] = useState("18");
  const [maxZoomOutInput, setMaxZoomOutInput] = useState("5");

  // GACS-style state variables
  const [gacsDevices, setGacsDevices] = useState<GacsDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [identifierType, setIdentifierType] = useState<"pppoe" | "serialnumber">("pppoe");
  const [manualCoords, setManualCoords] = useState(false);
  const [mapLayer, setMapLayer] = useState(() => localStorage.getItem("map-layer-preference") || "satellite");

  // Customer linkages states
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedEdgeForWaypoints, setSelectedEdgeForWaypoints] = useState<MapEdge | null>(null);

  // Existing ODPs state (for referencing in node modal)
  const [existingOdps, setExistingOdps] = useState<OdpItem[]>([]);
  const [linkedOdpId, setLinkedOdpId] = useState<number | null>(null);
  const [nodeLocked, setNodeLocked] = useState(false);

  // Confirm modal state (replaces window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem("map-layer-preference", mapLayer);
  }, [mapLayer]);

  useEffect(() => {
    if (!document.getElementById("polyline-animation-style")) {
      const style = document.createElement("style");
      style.id = "polyline-animation-style";
      style.innerHTML = `
        @keyframes dash-flow {
          to {
            stroke-dashoffset: -25;
          }
        }
        @keyframes blink-opacity {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animated-polyline {
          animation: dash-flow 0.6s linear infinite;
        }
        .blink-red {
          animation: blink-opacity 0.3s ease-in-out infinite !important;
          stroke-dashoffset: 0 !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Load all map data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nodesRes, edgesRes, settingsRes, gacsRes, customersRes, odpsRes] = await Promise.all([
        fetchNodes(),
        fetchEdges(),
        fetchMapSettings(),
        fetchGacsDevices({ limit: 1000 }).catch((e) => {
          console.warn("GACS integration not configured or offline:", e);
          return { success: false, data: [] };
        }),
        fetch("/api/v1/customers", { credentials: "include" }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch("/api/v1/odps", { credentials: "include" }).then(r => r.json()).catch(() => ({ data: [] }))
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

      // Extract settings data if wrapped in a "data" key
      const settingsData = settingsRes && (settingsRes as any).data ? (settingsRes as any).data : settingsRes;
      setSettings(settingsData);

      // Pre-fill map settings inputs
      setCenterLatInput(settingsData?.center_lat || "-6.2088");
      setCenterLngInput(settingsData?.center_lng || "106.8456");
      setDefaultZoomInput(settingsData?.default_zoom || "13");
      setMaxZoomInInput(settingsData?.max_zoom_in || "18");
      setMaxZoomOutInput(settingsData?.max_zoom_out || "5");

      // Set GACS devices
      const rawGacs: any = gacsRes;
      let rawGacsList: any[] = [];
      if (Array.isArray(rawGacs)) {
        rawGacsList = rawGacs;
      } else if (rawGacs && typeof rawGacs === "object") {
        if (Array.isArray(rawGacs.data)) {
          rawGacsList = rawGacs.data;
        } else if (rawGacs.data && Array.isArray(rawGacs.data.data)) {
          rawGacsList = rawGacs.data.data;
        }
      }

      const mappedGacsDevices = rawGacsList.map((d: any) => {
        if (d && typeof d === "object" && d._deviceId) {
          return d as GacsDevice;
        }
        const manufacturer = d.productclass ? d.productclass.split("-")[0].split(" ")[0] : "CIOT";
        const serial = d.SerialNumber || d._id?.split("-").pop() || "";
        const oui = d._id?.split("-")[0] || "";
        return {
          _id: d._id || "",
          _deviceId: {
            _Manufacturer: manufacturer,
            _ProductClass: d.productclass || "Unknown",
            _SerialNumber: serial,
            _OUI: oui,
          },
          _lastInform: d._lastInform,
          _tag: d.tags || [],
          _summary: {
            ssid: d.ssid1 || undefined,
            pppoe_username: d.pppoe || undefined,
            rx_power: d.rxpower ? `${d.rxpower} dBm` : undefined,
          }
        } as GacsDevice;
      });
      setGacsDevices(mappedGacsDevices);

      // Set Customers
      if (customersRes && Array.isArray(customersRes.data)) {
        setCustomers(customersRes.data);
      }

      // Set existing ODPs
      if (odpsRes && Array.isArray(odpsRes.data)) {
        setExistingOdps(odpsRes.data);
      }

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

  // Check online status of node
  const isNodeOffline = useCallback((node: MapNode) => {
    if (node.type !== "ont") return false;
    if (!node.pppoe && !node.serialnumber) return false;
    
    const device = gacsDevices.find(d => 
      (node.pppoe && d._summary?.pppoe_username === node.pppoe) ||
      (node.serialnumber && d._deviceId?._SerialNumber === node.serialnumber)
    );
    
    if (!device) return false; // Default to online
    
    if (!device._lastInform) return true;
    try {
      const lastInformTime = new Date(device._lastInform).getTime();
      const now = new Date().getTime();
      const diff = now - lastInformTime;
      return diff > 5 * 60 * 1000; // 5 minutes threshold
    } catch {
      return false;
    }
  }, [gacsDevices]);

  // Local filter for GACS devices
  const filteredDevices = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return gacsDevices.filter((d) => {
      if (identifierType === "pppoe") {
        return d._summary?.pppoe_username?.toLowerCase().includes(q) || false;
      } else {
        return d._deviceId?._SerialNumber?.toLowerCase().includes(q) || false;
      }
    });
  }, [gacsDevices, searchQuery, identifierType]);

  // Select device from GACS list
  const handleSelectDevice = (device: GacsDevice) => {
    const pppoe = device._summary?.pppoe_username || "";
    const sn = device._deviceId?._SerialNumber || "";
    
    if (identifierType === "pppoe") {
      setNodePppoeInput(pppoe);
      setNodeNameInput(pppoe || "ONT Customer");
      setNodeSnInput(sn);
      setSearchQuery(pppoe);
    } else {
      setNodeSnInput(sn);
      setNodeNameInput(sn || "ONT Customer");
      setNodePppoeInput(pppoe);
      setSearchQuery(sn);
    }
    setShowSearchDropdown(false);
  };

  // Handle map click when "add-node" tool is active
  const handleMapClick = useCallback((e: L.LeafletMouseEvent) => {
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
    
    setSearchQuery("");
    setIdentifierType("pppoe");
    setManualCoords(false);
    setSelectedCustomerId(null);

    setLinkedOdpId(null);
    setNodeLocked(false);
    setIsNodeModalOpen(true);
  }, [activeTool]);

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
        
        // Define ranking
        const typeRank: Record<string, number> = {
          server: 0,
          odc: 1,
          odp: 2,
          ont: 3,
        };
        const rankA = typeRank[firstNodeForEdge.type] ?? 99;
        const rankB = typeRank[node.type] ?? 99;
        
        let sourceNode = firstNodeForEdge;
        let targetNode = node;
        if (rankA > rankB) {
          sourceNode = node;
          targetNode = firstNodeForEdge;
        }

        setEdgeSourceInput(sourceNode.node_id);
        setEdgeTargetInput(targetNode.node_id);

        let defaultFiberType = "odc_odp";
        if (sourceNode.type === "server" && targetNode.type === "odc") {
          defaultFiberType = "server_odc";
        } else if (sourceNode.type === "server" && targetNode.type === "odp") {
          defaultFiberType = "server_odp";
        } else if (sourceNode.type === "odc" && targetNode.type === "odp") {
          defaultFiberType = "odc_odp";
        } else if (sourceNode.type === "odp" && targetNode.type === "ont") {
          defaultFiberType = "odp_ont";
        } else if (sourceNode.type === "ont" && targetNode.type === "ont") {
          defaultFiberType = "ont_ont";
        } else {
          defaultFiberType = "other";
        }
        setEdgeFiberTypeInput(defaultFiberType);

        // Compute distance automatically
        const dist = calculateDistance(
          parseLatitude(sourceNode.latitude),
          parseLongitude(sourceNode.longitude),
          parseLatitude(targetNode.latitude),
          parseLongitude(targetNode.longitude)
        );
        setEdgeDistanceInput(String(dist));
        setEdgeNotesInput("");
        setEdgeCountsAsPort(false);
        setEdgeOdpPortInput("");
        setPendingOdpAssignment(null);

        // --- Smart ODP-ONT connect logic ---
        if (sourceNode.type === "odp" && targetNode.type === "ont") {
          const odpNodeId = sourceNode.node_id;
          const ontPppoe = targetNode.pppoe;
          // Find the linked customer
          const customer = ontPppoe ? customers.find(c => c.user_pppoe === ontPppoe) : null;

          // Parse ODP DB id from node_id like "odp-42"
          const odpIdMatch = odpNodeId.match(/^odp-(\.?\d+)$/);
          const odpDbId = odpIdMatch ? parseInt(odpIdMatch[1], 10) : null;

          if (customer && odpDbId) {
            if (customer.odp_id === odpDbId) {
              // Already linked — just create the cable silently (no modal)
              setFirstNodeForEdge(null);
              const newEdge: import("../../types").MapEdge = {
                edge_id: `LINE-${Date.now().toString().slice(-6)}`,
                source: sourceNode.node_id,
                target: targetNode.node_id,
                fiber_type: "odp_ont",
                distance: dist,
              };
              const updatedEdges = [...edges, newEdge];
              setEdges(updatedEdges);
              setIsDirty(true);
              setActiveTool("select");
              void syncData(nodes, updatedEdges);
              pushSuccess(`Kabel ODP→ONT berhasil dihubungkan untuk ${customer.name}.`);
              return;
            } else {
              // No prior ODP assignment — show modal with port picker
              setPendingOdpAssignment({ customerId: customer.id, odpId: odpDbId });
            }
          }
        }

        setIsEdgeModalOpen(true);
      }
    }
  };

  // Helper to autosave map data to backend
  const syncData = useCallback(async (newNodes: MapNode[], newEdges: MapEdge[]) => {
    setSaving(true);
    try {
      await syncMappingData({ nodes: newNodes, edges: newEdges });
      setIsDirty(false);
    } catch {
      pushError("Gagal menyinkronkan data peta jaringan ke server.");
    } finally {
      setSaving(false);
    }
  }, [pushError]);

  // Node marker dragged — locked nodes skip drag
  const handleNodeDragEnd = (nodeId: string, event: L.DragEndEvent) => {
    const node = nodes.find(n => n.node_id === nodeId);
    if (node?.locked) return; // locked nodes can't be moved

    const marker = event.target as L.Marker;
    const position = marker.getLatLng();

    const updatedNodes = nodes.map((n) =>
      n.node_id === nodeId
        ? { ...n, latitude: position.lat, longitude: position.lng }
        : n
    );
    setNodes(updatedNodes);
    setIsDirty(true);
    void syncData(updatedNodes, edges);
  };

  // Toggle lock for a node directly from popup
  const handleToggleLock = (nodeId: string) => {
    const updatedNodes = nodes.map((n) =>
      n.node_id === nodeId ? { ...n, locked: !n.locked } : n
    );
    setNodes(updatedNodes);
    setIsDirty(true);
    void syncData(updatedNodes, edges);
  };

  // Save Node modal submission
  const handleSaveNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeIdInput.trim() || !nodeNameInput.trim()) {
      pushError("ID Node dan Nama wajib diisi.");
      return;
    }

    // Parse capacity
    let capacityNum: number | undefined = undefined;
    if (nodeTypeInput === "server" || nodeTypeInput === "odc" || nodeTypeInput === "odp") {
      const parsed = parseInt(nodeCapacityInput, 10);
      if (Number.isFinite(parsed)) {
        capacityNum = parsed;
      } else {
        capacityNum = nodeTypeInput === "server" ? 48 : nodeTypeInput === "odc" ? 96 : 8;
      }
    }

    let updatedNodes = [...nodes];
    let updatedEdges = [...edges];

    const pppoeVal = nodeTypeInput === "ont" ? (nodePppoeInput.trim() || undefined) : undefined;
    const snVal = nodeTypeInput === "ont" ? (nodeSnInput.trim() || undefined) : undefined;
    const splitterVal = (nodeTypeInput === "odc" || nodeTypeInput === "odp") ? (nodeSplitterInput.trim() || undefined) : undefined;

    if (nodeTypeInput === "ont" && selectedCustomerId) {
      const matchedCust = customers.find((c) => c.id === selectedCustomerId);
      if (matchedCust) {
        try {
          const updatedCust = {
            ...matchedCust,
            sn_ont: snVal || "",
            user_pppoe: pppoeVal || "",
          };
          await updateCustomer(selectedCustomerId, updatedCust);
          pushSuccess("Pelanggan berhasil ditautkan ke ONT & sync ke GenieACS.");
          // Refresh customer list locally to stay in sync
          const customersRes = await fetch("/api/v1/customers", { credentials: "include" }).then((r) => r.json());
          if (customersRes && Array.isArray(customersRes.data)) {
            setCustomers(customersRes.data);
          }
        } catch (err: any) {
          console.error("Gagal menautkan pelanggan", err);
          pushError(`Gagal menautkan pelanggan: ${err.message}`);
          return;
        }
      }
    }

    if (editingNode) {
      // Edit mode
      updatedNodes = nodes.map((n) => {
        if (n.node_id === editingNode.node_id) {
          return {
            ...n,
            node_id: nodeIdInput.trim(),
            name: nodeNameInput.trim(),
            type: nodeTypeInput,
            latitude: nodeLatInput,
            longitude: nodeLngInput,
            capacity: capacityNum,
            splitter: splitterVal,
            pppoe: pppoeVal,
            serialnumber: snVal,
            notes: nodeNotesInput.trim() || undefined,
            locked: nodeLocked,
          };
        }

        // Clean up duplicate customer references on other nodes
        if (nodeTypeInput === "ont") {
          const matchesPppoe = pppoeVal && n.pppoe === pppoeVal;
          const matchesSn = snVal && n.serialnumber === snVal;
          if (matchesPppoe || matchesSn) {
            return {
              ...n,
              pppoe: undefined,
              serialnumber: undefined,
            };
          }
        }
        return n;
      });
      // Update referencing edges if the node_id changed
      if (editingNode.node_id !== nodeIdInput.trim()) {
        updatedEdges = edges.map((edge) => {
          let src = edge.source;
          let tgt = edge.target;
          if (edge.source === editingNode.node_id) src = nodeIdInput.trim();
          if (edge.target === editingNode.node_id) tgt = nodeIdInput.trim();
          return { ...edge, source: src, target: tgt };
        });
      }
      pushSuccess("Node berhasil diperbarui.");
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
        splitter: splitterVal,
        pppoe: pppoeVal,
        serialnumber: snVal,
        notes: nodeNotesInput.trim() || undefined,
        locked: nodeLocked,
      };

      // Clean up duplicate customer references on other nodes
      const clearedNodes = nodes.map((n) => {
        if (nodeTypeInput === "ont") {
          const matchesPppoe = pppoeVal && n.pppoe === pppoeVal;
          const matchesSn = snVal && n.serialnumber === snVal;
          if (matchesPppoe || matchesSn) {
            return {
              ...n,
              pppoe: undefined,
              serialnumber: undefined,
            };
          }
        }
        return n;
      });
      updatedNodes = [...clearedNodes, newNode];
      pushSuccess("Node baru berhasil ditambahkan.");
    }

    if (nodeTypeInput === "ont" && selectedCustomerId) {
      const matchedCust = customers.find((c) => c.id === selectedCustomerId);
      if (matchedCust && matchedCust.odp_id) {
        const odpItem = existingOdps.find((o) => o.id === matchedCust.odp_id);
        if (odpItem) {
          const odpNode = updatedNodes.find((n) => n.type === "odp" && n.name === odpItem.nama);
          if (odpNode) {
            const activeOntId = nodeIdInput.trim();
            // Remove any existing edge of type odp_ont for this ONT that connects to a DIFFERENT odp node
            updatedEdges = updatedEdges.filter((e) => {
              const isSourceOnt = e.source === activeOntId;
              const isTargetOnt = e.target === activeOntId;
              if (isSourceOnt || isTargetOnt) {
                const otherNodeId = isSourceOnt ? e.target : e.source;
                const otherNode = updatedNodes.find((n) => n.node_id === otherNodeId);
                if (otherNode && otherNode.type === "odp" && otherNode.node_id !== odpNode.node_id) {
                  return false;
                }
              }
              return true;
            });

            // Check if current connection already exists
            const edgeExists = updatedEdges.some((e) =>
              (e.source === activeOntId && e.target === odpNode.node_id) ||
              (e.source === odpNode.node_id && e.target === activeOntId)
            );

            if (!edgeExists) {
              const dist = calculateDistance(
                parseLatitude(odpNode.latitude),
                parseLongitude(odpNode.longitude),
                parseLatitude(nodeLatInput),
                parseLongitude(nodeLngInput)
              );
              const autoEdge: MapEdge = {
                edge_id: `LINE-${Date.now().toString().slice(-6)}`,
                source: odpNode.node_id,
                target: activeOntId,
                fiber_type: "odp_ont",
                distance: dist,
              };
              updatedEdges.push(autoEdge);
            }
          }
        }
      }
    }

    setNodes(updatedNodes);
    setEdges(updatedEdges);
    setIsNodeModalOpen(false);
    setIsDirty(true);
    setActiveTool("select");
    void syncData(updatedNodes, updatedEdges);
  };

  // Save Edge modal submission
  const handleSaveEdge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edgeIdInput.trim() || !edgeSourceInput || !edgeTargetInput) {
      pushError("ID Kabel, Asal, dan Tujuan wajib diisi.");
      return;
    }

    const distNum = edgeDistanceInput ? parseFloat(edgeDistanceInput) : undefined;
    let updatedEdges = [...edges];

    if (editingEdge) {
      updatedEdges = edges.map((edge) =>
        edge.edge_id === editingEdge.edge_id
          ? {
              ...edge,
              edge_id: edgeIdInput.trim(),
              source: edgeSourceInput,
              target: edgeTargetInput,
              fiber_type: edgeFiberTypeInput,
              distance: distNum,
              notes: edgeNotesInput.trim() || undefined,
              counts_as_port: edgeCountsAsPort,
            }
          : edge
      );
      pushSuccess("Kabel berhasil diperbarui.");
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
        counts_as_port: edgeCountsAsPort,
      };
      updatedEdges = [...edges, newEdge];
      pushSuccess("Kabel baru berhasil ditambahkan.");
    }

    // If this is a new ODP→ONT assignment, save port to database
    if (pendingOdpAssignment && !editingEdge) {
      const portNum = edgeOdpPortInput ? parseInt(edgeOdpPortInput, 10) : null;
      try {
        await assignCustomerOdp(pendingOdpAssignment.customerId, pendingOdpAssignment.odpId, portNum);
        // Update local customers state
        setCustomers(prev => prev.map(c =>
          c.id === pendingOdpAssignment!.customerId
            ? { ...c, odp_id: pendingOdpAssignment!.odpId, odp_port: portNum ?? undefined }
            : c
        ));
      } catch {
        pushError("Kabel berhasil dibuat, tapi gagal menyimpan port ODP ke database.");
      }
    }

    setEdges(updatedEdges);
    setIsEdgeModalOpen(false);
    setIsDirty(true);
    setFirstNodeForEdge(null);
    setPendingOdpAssignment(null);
    setEdgeOdpPortInput("");
    setEdgeCountsAsPort(false);
    setActiveTool("select");
    void syncData(nodes, updatedEdges);
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setConfirmModal({
      title: "Hapus Node",
      message: `Hapus node "${nodeId}"? Semua kabel yang terhubung juga akan dihapus.`,
      onConfirm: () => {
        const updatedNodes = nodes.filter((n) => n.node_id !== nodeId);
        const updatedEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
        setNodes(updatedNodes);
        setEdges(updatedEdges);
        setIsDirty(true);
        pushSuccess("Node dihapus.");
        void syncData(updatedNodes, updatedEdges);
        setConfirmModal(null);
      },
    });
  };

  // Delete edge
  const handleDeleteEdge = (edgeId: string) => {
    setConfirmModal({
      title: "Hapus Kabel",
      message: `Hapus kabel "${edgeId}"?`,
      onConfirm: () => {
        const updatedEdges = edges.filter((edge) => edge.edge_id !== edgeId);
        setEdges(updatedEdges);
        setIsDirty(true);
        if (selectedEdgeForWaypoints?.edge_id === edgeId) {
          setSelectedEdgeForWaypoints(null);
        }
        pushSuccess("Kabel dihapus.");
        void syncData(nodes, updatedEdges);
        setConfirmModal(null);
      },
    });
  };

  const handleWaypointDragEnd = (edgeId: string, index: number, event: L.DragEndEvent) => {
    const marker = event.target as L.Marker;
    const position = marker.getLatLng();

    const updatedEdges = edges.map((edge) => {
      if (edge.edge_id !== edgeId || !edge.waypoints) return edge;
      const updatedWps = [...edge.waypoints];
      updatedWps[index] = [position.lat, position.lng];
      return { ...edge, waypoints: updatedWps };
    });

    setEdges(updatedEdges);
    setIsDirty(true);
    void syncData(nodes, updatedEdges);
  };

  const handleAddWaypoint = (edgeId: string) => {
    const edge = edges.find((e) => e.edge_id === edgeId);
    if (!edge) return;

    const srcNode = nodes.find((n) => n.node_id === edge.source);
    const tgtNode = nodes.find((n) => n.node_id === edge.target);
    if (!srcNode || !tgtNode) return;

    // Default to midpoint between source and target, or last waypoint and target
    let startLat = parseLatitude(srcNode.latitude);
    let startLng = parseLongitude(srcNode.longitude);
    if (edge.waypoints && edge.waypoints.length > 0) {
      const lastWp = edge.waypoints[edge.waypoints.length - 1];
      startLat = lastWp[0];
      startLng = lastWp[1];
    }
    const endLat = parseLatitude(tgtNode.latitude);
    const endLng = parseLongitude(tgtNode.longitude);

    const midLat = (startLat + endLat) / 2;
    const midLng = (startLng + endLng) / 2;

    const currentWps = edge.waypoints ? [...edge.waypoints] : [];
    const updatedWps: [number, number][] = [...currentWps, [midLat, midLng]];

    const updatedEdges = edges.map((e) =>
      e.edge_id === edgeId ? { ...e, waypoints: updatedWps } : e
    );
    setEdges(updatedEdges);
    setIsDirty(true);
    void syncData(nodes, updatedEdges);
  };

  const handleRemoveWaypoint = (edgeId: string, index: number) => {
    const updatedEdges = edges.map((edge) => {
      if (edge.edge_id !== edgeId || !edge.waypoints) return edge;
      const updatedWps = edge.waypoints.filter((_, idx) => idx !== index);
      return { ...edge, waypoints: updatedWps };
    });

    setEdges(updatedEdges);
    setIsDirty(true);
    void syncData(nodes, updatedEdges);
  };

  const handleResetWaypoints = (edgeId: string) => {
    setConfirmModal({
      title: "Reset Belokan",
      message: "Hapus semua belokan di kabel ini?",
      onConfirm: () => {
        const updatedEdges = edges.map((edge) =>
          edge.edge_id === edgeId ? { ...edge, waypoints: [] } : edge
        );
        setEdges(updatedEdges);
        setIsDirty(true);
        void syncData(nodes, updatedEdges);
        setConfirmModal(null);
      },
    });
  };

  // Sync data to DB
  const handleSync = async () => {
    await syncData(nodes, edges);
    pushSuccess("Peta jaringan berhasil disinkronisasi ke server!");
  };

  // Reset all mapping data on database - triggers confirmation modal
  const handleResetAll = () => {
    setResetPasswordInput("");
    setIsResetModalOpen(true);
  };

  const handleConfirmResetAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordInput.trim()) {
      pushError("Password wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      await resetMappingData(resetPasswordInput);
      pushSuccess("Seluruh data peta jaringan berhasil direset.");
      setIsResetModalOpen(false);
      void loadData();
    } catch (err: any) {
      console.error(err);
      pushError(err.message || "Gagal mereset data peta jaringan.");
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
    setConfirmModal({
      title: "Reset Pengaturan Peta",
      message: "Reset pengaturan peta ke default Jakarta?",
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await resetMapSettings();
          const settingsData = res && (res as any).data ? (res as any).data : res;
          setSettings(settingsData);
          setCenterLatInput(settingsData?.center_lat || "-6.2088");
          setCenterLngInput(settingsData?.center_lng || "106.8456");
          setDefaultZoomInput(settingsData?.default_zoom || "13");
          setMaxZoomInInput(settingsData?.max_zoom_in || "18");
          setMaxZoomOutInput(settingsData?.max_zoom_out || "5");
          pushSuccess("Pengaturan peta direset ke default.");
          setIsSettingsModalOpen(false);
        } catch {
          pushError("Gagal mereset pengaturan peta.");
        }
      },
    });
  };

  // Custom marker icon creation with GACS SVG Leaflet Icons
  const createCustomIcon = (type: "server" | "odc" | "odp" | "ont", name: string, isOffline = false) => {
    const colors = {
      server: "#9333ea",
      odc: "#2563eb",
      odp: "#06b6d4",
      ont: isOffline ? "#9ca3af" : "#ea580c",
    };
    const svgs = {
      server: `<path d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
      odc: `<path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
      odp: `<path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
      ont: `<path d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    };

    return L.divIcon({
      className: "custom-marker leaflet-zoom-hide",
      html: `
        <div class="flex flex-col items-center select-none">
          <div style="
            background-color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              width: 22px;
              height: 22px;
              background-color: ${colors[type]};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <svg width="12" height="12" fill="white" viewBox="0 0 24 24">
                ${svgs[type]}
              </svg>
            </div>
          </div>
          <div class="mt-1 px-1.5 py-0.5 bg-white border border-slate-200 dark:border-slate-800 text-[9px] font-bold rounded shadow text-slate-800 dark:text-slate-200 max-w-[80px] truncate text-center">
            ${name}
          </div>
        </div>
      `,
      iconSize: [80, 52],
      iconAnchor: [40, 15],
      popupAnchor: [0, -15],
    });
  };

  // Helper to resolve edge coordinates from nodes
  const resolveEdgePositions = (edge: MapEdge): [number, number][] => {
    const srcNode = nodes.find((n) => n.node_id === edge.source);
    const tgtNode = nodes.find((n) => n.node_id === edge.target);
    if (!srcNode || !tgtNode) return [];
    const srcPos: [number, number] = [parseLatitude(srcNode.latitude), parseLongitude(srcNode.longitude)];
    const tgtPos: [number, number] = [parseLatitude(tgtNode.latitude), parseLongitude(tgtNode.longitude)];
    if (edge.waypoints && Array.isArray(edge.waypoints)) {
      const wps: [number, number][] = edge.waypoints.map(wp => [parseLatitude(wp[0]), parseLongitude(wp[1])]);
      return [srcPos, ...wps, tgtPos];
    }
    return [srcPos, tgtPos];
  };

  // Resolve fiber line color (GACS colors)
  const getFiberColor = (type?: string) => {
    switch (type) {
      case "server_odc":
      case "feeder":
      case "odc_to_odc":
      case "odc_to_odc_ratio":
        return "#f43f5e"; // Rose / Red
      case "server_odp":
        return "#a855f7"; // Purple
      case "odc_odp":
      case "distribution":
        return "#3b82f6"; // Blue
      case "odp_ont":
      case "drop":
      case "dop":
        return "#10b981"; // Emerald Green
      case "ont_ont":
        return "#f59e0b"; // Amber/Yellow
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

          {/* Waypoints Editor (Rendered when an edge is selected) */}
          {selectedEdgeForWaypoints && (() => {
            const edge = edges.find(e => e.edge_id === selectedEdgeForWaypoints.edge_id);
            if (!edge) return null;
            return (
              <div className="mt-4 border border-indigo-150 rounded-2xl p-4 bg-indigo-50/30 space-y-3 font-sans">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <Link className="w-3.5 h-3.5 text-indigo-500" />
                    Edit Belokan: {edge.edge_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedEdgeForWaypoints(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  Tambahkan titik belokan pada kabel ini. Anda bisa menyeret titik kuning di peta untuk mengatur posisi belokannya.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddWaypoint(edge.edge_id)}
                    className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-indigo-600 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Belokan
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetWaypoints(edge.edge_id)}
                    className="bg-white hover:bg-red-50 border border-slate-200 text-red-600 text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm transition-colors"
                  >
                    Reset
                  </button>
                </div>

                {edge.waypoints && edge.waypoints.length > 0 && (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {edge.waypoints.map((wp, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-1.5 text-[10px] font-mono">
                        <span className="text-slate-600">Pt #{idx + 1}: {wp[0].toFixed(5)}, {wp[1].toFixed(5)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWaypoint(edge.edge_id, idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

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

          {mapLayer === "satellite" ? (
            <TileLayer
              key="satellite"
              attribution="© Google Maps"
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              maxZoom={mapZoomRange.maxZoom}
            />
          ) : mapLayer === "satellite-plain" ? (
            <TileLayer
              key="satellite-plain"
              attribution="© Google Maps"
              url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
              maxZoom={mapZoomRange.maxZoom}
            />
          ) : (
            <TileLayer
              key="street"
              attribution="© Google Maps"
              url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              maxZoom={mapZoomRange.maxZoom}
            />
          )}

          {/* Render Cable Lines (Edges) */}
          {edges.map((edge) => {
            const positions = resolveEdgePositions(edge);
            if (positions.length < 2) return null;

            const sourceNode = nodes.find(n => n.node_id === edge.source);
            const targetNode = nodes.find(n => n.node_id === edge.target);
            const isSourceOffline = sourceNode ? isNodeOffline(sourceNode) : false;
            const isTargetOffline = targetNode ? isNodeOffline(targetNode) : false;
            const isOffline = isSourceOffline || isTargetOffline;

            const isSelected = selectedEdgeForWaypoints?.edge_id === edge.edge_id;
            return (
              <Polyline
                key={edge.edge_id}
                positions={positions}
                color={isOffline ? "#EF4444" : getFiberColor(edge.fiber_type)}
                weight={isSelected ? 10 : 6}
                opacity={0.9}
                dashArray={isSelected ? undefined : "10, 15"}
                className={isOffline ? "blink-red" : "animated-polyline"}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    setSelectedEdgeForWaypoints(edge);
                  }
                }}
              >
                <Popup>
                  <div className="p-1 text-slate-800 min-w-[200px] dark:text-slate-200">
                    <p className="font-bold text-sm border-b pb-1 mb-2 text-slate-900 dark:text-white flex items-center gap-1.5">
                      🔌 Kabel Fiber: {edge.edge_id}
                    </p>
                    <div className="space-y-1 text-xs mb-3">
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Asal:</span>
                        <span className="font-semibold">{edge.source}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Tujuan:</span>
                        <span className="font-semibold">{edge.target}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">Tipe:</span>
                        <span className="font-semibold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getFiberColor(edge.fiber_type) }} />
                          {edge.fiber_type === "server_odc" ? "Server ke ODC" :
                           edge.fiber_type === "server_odp" ? "Server ke ODP" :
                           edge.fiber_type === "odc_odp" ? "ODC ke ODP" :
                           edge.fiber_type === "odp_ont" ? "ODP ke ONT (Drop)" :
                           edge.fiber_type === "ont_ont" ? "ONT ke ONT" :
                           edge.fiber_type || "Lainnya"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Jarak:</span>
                        <span className="font-semibold">{edge.distance ? `${edge.distance >= 1000 ? (edge.distance / 1000).toFixed(2) + " km" : edge.distance.toFixed(1) + " m"}` : "—"}</span>
                      </div>
                    </div>
                    {edge.notes && (
                      <p className="text-[10px] italic bg-slate-50 dark:bg-slate-800 p-1.5 border dark:border-slate-700 rounded text-slate-500 dark:text-slate-400 mb-3">
                        {edge.notes}
                      </p>
                    )}

                    <div className="flex gap-2">
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
                          setEdgeCountsAsPort(!!edge.counts_as_port);
                          setIsEdgeModalOpen(true);
                        }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white py-1 rounded text-center text-xs font-semibold flex items-center justify-center gap-1 transition"
                      >
                        <Edit className="w-3 h-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEdge(edge.edge_id)}
                        className="flex-1 bg-red-500 hover:bg-red-600 text-white py-1 rounded text-center text-xs font-semibold flex items-center justify-center gap-1 transition shadow"
                      >
                        <Trash2 className="w-3 h-3" /> Hapus
                      </button>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

          {/* Draggable Waypoint Handles for the selected Edge */}
          {selectedEdgeForWaypoints && (() => {
            const edge = edges.find(e => e.edge_id === selectedEdgeForWaypoints.edge_id);
            if (!edge || !edge.waypoints || edge.waypoints.length === 0) return null;
            return edge.waypoints.map((wp, idx) => (
              <Marker
                key={`wp-${edge.edge_id}-${idx}`}
                position={[wp[0], wp[1]]}
                draggable={true}
                icon={L.divIcon({
                  className: "waypoint-handle",
                  html: `<div style="background-color: #f59e0b; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.3);"></div>`,
                  iconSize: [12, 12],
                  iconAnchor: [6, 6]
                })}
                eventHandlers={{
                  dragend: (e) => handleWaypointDragEnd(edge.edge_id, idx, e)
                }}
              />
            ));
          })()}

          {/* Render Infrastructure Markers (Nodes) */}
          {nodes.map((node) => {
            const isOffline = isNodeOffline(node);
            const isLocked = node.locked === true;
            return (
              <Marker
                key={node.node_id}
                position={[parseLatitude(node.latitude), parseLongitude(node.longitude)]}
                icon={createCustomIcon(node.type, node.name, isOffline)}
                draggable={activeTool === "select" && !isLocked}
                eventHandlers={{
                  click: () => handleNodeClick(node),
                  dragend: (e) => handleNodeDragEnd(node.node_id, e),
                }}
              >
                <Popup>
                  <div className="p-1 text-slate-800 min-w-[220px] dark:text-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                        node.type === "server"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                          : node.type === "odc"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                          : node.type === "odp"
                          ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300"
                          : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                      }`}>
                        {node.type === "server" ? "🖥️ Server" : node.type === "odc" ? "📦 ODC" : node.type === "odp" ? "🔌 ODP" : "📡 ONT"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isLocked && (
                          <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            <Lock className="w-2.5 h-2.5" /> Terkunci
                          </span>
                        )}
                        {node.type === "ont" && (
                          <span className={`w-2.5 h-2.5 rounded-full ${isOffline ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} title={isOffline ? "Offline" : "Online"} />
                        )}
                      </div>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-2">{node.name}</h3>
                    
                    <div className="space-y-1 text-xs mb-3 border-t pt-1.5 border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Node ID:</span>
                        <span className="font-semibold font-mono">{node.node_id}</span>
                      </div>
                      {node.capacity !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Kapasitas:</span>
                          <span className="font-semibold">{node.capacity} Port</span>
                        </div>
                      )}
                      {node.splitter && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Splitter:</span>
                          <span className="font-semibold">{node.splitter}</span>
                        </div>
                      )}
                      {node.pppoe && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">PPPoE:</span>
                          <span className="font-semibold">{node.pppoe}</span>
                        </div>
                      )}
                      {node.serialnumber && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">SN:</span>
                          <span className="font-semibold font-mono">{node.serialnumber}</span>
                        </div>
                      )}
                    </div>
                    
                    {node.type === "odp" && (() => {
                      const capacity = node.capacity || 8;
                      const connectedOnts = edges
                        .filter(e => e.source === node.node_id || e.target === node.node_id)
                        .map(e => {
                          const otherId = e.source === node.node_id ? e.target : e.source;
                          return nodes.find(n => n.node_id === otherId && n.type === "ont");
                        })
                        .filter((n): n is MapNode => !!n);

                      const parentNode = edges
                        .filter(e => e.source === node.node_id || e.target === node.node_id)
                        .map(e => {
                          const otherId = e.source === node.node_id ? e.target : e.source;
                          return nodes.find(n => n.node_id === otherId && (n.type === "odc" || n.type === "server"));
                        })
                        .find(n => !!n);

                      const usagePercent = Math.min((connectedOnts.length / capacity) * 100, 100);
                      const isFull = connectedOnts.length >= capacity;
                      const availablePorts = Math.max(capacity - connectedOnts.length, 0);

                      return (
                        <div className="mt-3.5 space-y-3.5 border-t pt-3.5 border-slate-100 dark:border-slate-800">
                          {/* Slot Usage */}
                          <div>
                            <div className="flex justify-between text-xs font-bold mb-1">
                              <span className="text-slate-500">Slot Usage</span>
                              <span className="text-slate-800 dark:text-slate-200">
                                {connectedOnts.length} / {capacity}
                              </span>
                            </div>
                            <div className="w-full bg-slate-150 dark:bg-slate-800/80 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isFull ? "bg-red-500" : "bg-emerald-500"
                                }`}
                                style={{ width: `${usagePercent}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                              <span>Tingkat Kepadatan</span>
                              <span className={isFull ? "text-red-500 font-semibold" : "text-emerald-500 font-semibold"}>
                                {availablePorts} port tersedia
                              </span>
                            </div>
                          </div>

                          {/* Connected From */}
                          {parentNode && (
                            <div className="bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg border dark:border-slate-800">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Connected From</p>
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                {parentNode.name} ({parentNode.type.toUpperCase()})
                              </div>
                            </div>
                          )}

                          {/* Connected to ONTs */}
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                              Connected to ONTs ({connectedOnts.length})
                            </p>
                            {connectedOnts.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">Belum ada ONT terhubung</p>
                            ) : (
                              <div className="max-h-24 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                                {connectedOnts.map((ont) => {
                                  const isOntOffline = isNodeOffline(ont);
                                  return (
                                    <div
                                      key={ont.node_id}
                                      className="flex items-center justify-between text-[11px] py-1 px-1.5 rounded bg-slate-50/50 dark:bg-slate-900/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 border dark:border-slate-800"
                                    >
                                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[130px]" title={ont.name}>
                                        {ont.name}
                                      </span>
                                      <span className={`w-1.5 h-1.5 rounded-full ${isOntOffline ? "bg-red-500" : "bg-emerald-500"}`} />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Copy Info Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const info = `ODP Name: ${node.name}\nCoordinates: ${node.latitude}, ${node.longitude}\nUsage: ${connectedOnts.length}/${capacity} Ports`;
                              void navigator.clipboard.writeText(info);
                              pushSuccess("Info ODP disalin ke clipboard!");
                            }}
                            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 text-slate-750 dark:text-slate-300 text-[10px] font-bold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                          >
                            Copy Info
                          </button>
                        </div>
                      );
                    })()}
                    
                    {node.notes && (
                      <p className="text-[10px] italic bg-slate-50 dark:bg-slate-800 p-1.5 border dark:border-slate-700 rounded text-slate-500 dark:text-slate-400 mb-3">
                        {node.notes}
                      </p>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleToggleLock(node.node_id)}
                        className={`flex-1 py-1 rounded text-center text-xs font-semibold flex items-center justify-center gap-1 transition ${
                          isLocked
                            ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200"
                            : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white"
                        }`}
                        title={isLocked ? "Klik untuk membuka kunci posisi" : "Klik untuk mengunci posisi node"}
                      >
                        {isLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {isLocked ? "Buka Kunci" : "Kunci"}
                      </button>
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
                          setNodeLocked(node.locked || false);
                          
                          setSearchQuery(node.pppoe || node.serialnumber || "");
                          setIdentifierType(node.pppoe ? "pppoe" : "serialnumber");
                          setManualCoords(false);

                          if (node.type === "ont") {
                            const matched = customers.find(
                              (c) =>
                                (node.pppoe && c.user_pppoe === node.pppoe) ||
                                (node.serialnumber && c.sn_ont === node.serialnumber)
                            );
                            setSelectedCustomerId(matched ? matched.id : null);
                          } else {
                            setSelectedCustomerId(null);
                          }

                          // Link ODP if this is an ODP node
                          if (node.type === "odp") {
                            const odpIdMatch = node.node_id.match(/^odp-(\d+)$/);
                            setLinkedOdpId(odpIdMatch ? parseInt(odpIdMatch[1], 10) : null);
                          } else {
                            setLinkedOdpId(null);
                          }
                          
                          setIsNodeModalOpen(true);
                        }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white py-1 rounded text-center text-xs font-semibold flex items-center justify-center gap-1 transition"
                      >
                        <Edit className="w-3 h-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteNode(node.node_id)}
                        disabled={isLocked}
                        title={isLocked ? "Buka kunci terlebih dahulu sebelum menghapus" : "Hapus node dari peta"}
                        className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-red-200 disabled:cursor-not-allowed text-white py-1 rounded text-center text-xs font-semibold flex items-center justify-center gap-1 transition shadow"
                      >
                        <Trash2 className="w-3 h-3" /> Hapus
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Map Layer Toggle Button */}
        <div className="absolute bottom-4 right-4 z-[999]">
          <button
            type="button"
            onClick={() => {
              setMapLayer(prev => 
                prev === "street" ? "satellite" : prev === "satellite" ? "satellite-plain" : "street"
              );
            }}
            className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl shadow-lg p-2.5 transition-colors flex flex-col items-center gap-1 min-w-[70px] border border-slate-200 dark:border-slate-700"
            title={
              mapLayer === "street"
                ? "Switch to Satellite"
                : mapLayer === "satellite"
                ? "Switch to Satellite Plain"
                : "Switch to Street Map"
            }
          >
            {mapLayer === "street" ? (
              <>
                <svg className="h-5 w-5 text-slate-700 dark:text-slate-300 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Satellite</span>
              </>
            ) : mapLayer === "satellite" ? (
              <>
                <svg className="h-5 w-5 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Sat Plain</span>
              </>
            ) : (
              <>
                <svg className="h-5 w-5 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Street</span>
              </>
            )}
          </button>
        </div>
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

            <div className="grid gap-3.5 max-h-[450px] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ID NODE (KODE)</label>
                <input
                  type="text"
                  required
                  className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  value={nodeIdInput}
                  onChange={(e) => setNodeIdInput(e.target.value)}
                  placeholder="Contoh: ODP-MERDEKA-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">TIPE INFRASTRUKTUR</label>
                  <select
                    className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={nodeTypeInput}
                    onChange={(e) => {
                      const val = e.target.value as "server" | "odc" | "odp" | "ont";
                      setNodeTypeInput(val);
                      setLinkedOdpId(null);
                      if (val === "server") {
                        setNodeCapacityInput("48");
                        setNodeSplitterInput("");
                      } else if (val === "odc") {
                        setNodeCapacityInput("96");
                        setNodeSplitterInput("1:8");
                      } else if (val === "odp") {
                        setNodeCapacityInput("8");
                        setNodeSplitterInput("1:8");
                      } else {
                        setNodeCapacityInput("");
                        setNodeSplitterInput("");
                      }
                    }}
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
                    className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    value={nodeNameInput}
                    onChange={(e) => setNodeNameInput(e.target.value)}
                    placeholder="Contoh: ODP Sudirman 03"
                  />
                </div>
              </div>

              {nodeTypeInput === "ont" && (
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-900/20 grid gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">TAUTKAN DENGAN PELANGGAN</label>
                    <select
                      className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      value={selectedCustomerId || ""}
                      onChange={(e) => {
                        const cid = Number(e.target.value) || 0;
                        setSelectedCustomerId(cid || null);
                        const matchedCust = customers.find(c => c.id === cid);
                        if (matchedCust) {
                          setNodeNameInput(matchedCust.name);
                          setNodePppoeInput(matchedCust.user_pppoe || "");
                          setNodeSnInput(matchedCust.sn_ont || "");
                          setSearchQuery(matchedCust.user_pppoe || matchedCust.sn_ont || "");
                        }
                      }}
                    >
                      <option value="">-- Pilih Pelanggan (Jika ada) --</option>
                      {customers
                        .filter((c) => {
                          if (selectedCustomerId && c.id === selectedCustomerId) {
                            return true;
                          }
                          const isAlreadyLinked = nodes.some(
                            (n) =>
                              n.type === "ont" &&
                              n.node_id !== editingNode?.node_id && (
                                (c.user_pppoe && n.pppoe === c.user_pppoe) ||
                                (c.sn_ont && n.serialnumber === c.sn_ont)
                              )
                          );
                          return !isAlreadyLinked;
                        })
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.user_pppoe ? `(PPPoE: ${c.user_pppoe})` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">TIPE IDENTIFIER</label>
                    <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIdentifierType("pppoe");
                          setSearchQuery("");
                        }}
                        className={`flex-1 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                          identifierType === "pppoe" ? "bg-orange-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                        }`}
                      >
                        PPPoE Username
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIdentifierType("serialnumber");
                          setSearchQuery("");
                        }}
                        className={`flex-1 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                          identifierType === "serialnumber" ? "bg-orange-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                        }`}
                      >
                        Serial Number
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                      CARI PERANGKAT GENIEACS
                    </label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowSearchDropdown(true);
                      }}
                      onFocus={() => setShowSearchDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
                      placeholder={`Ketik untuk mencari ${identifierType === "pppoe" ? "username PPPoE" : "Serial Number"}...`}
                      className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      autoComplete="off"
                    />

                    {showSearchDropdown && searchQuery && (
                      <div className="absolute z-[100] w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {filteredDevices.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-slate-400 italic">
                            Tidak ditemukan hasil yang cocok
                          </div>
                        ) : (
                          filteredDevices.map((dev) => {
                            const pppoe = dev._summary?.pppoe_username || "";
                            const sn = dev._deviceId?._SerialNumber || "";
                            const val = identifierType === "pppoe" ? pppoe : sn;
                            const sub = identifierType === "pppoe" ? `SN: ${sn}` : `PPPoE: ${pppoe}`;
                            return (
                              <button
                                key={dev._id}
                                type="button"
                                onClick={() => handleSelectDevice(dev)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 border-b dark:border-slate-700 last:border-0 flex flex-col"
                              >
                                <span className="font-bold text-slate-800 dark:text-slate-200">{val}</span>
                                <span className="text-[10px] text-slate-400">{sub}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">PPPOE USERNAME</label>
                      <input
                        type="text"
                        className="w-full text-xs px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
                        value={nodePppoeInput}
                        onChange={(e) => setNodePppoeInput(e.target.value)}
                        placeholder="user_pppoe"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">SERIAL NUMBER</label>
                      <input
                        type="text"
                        className="w-full text-xs px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
                        value={nodeSnInput}
                        onChange={(e) => setNodeSnInput(e.target.value)}
                        placeholder="Serial Number (Opsional)"
                      />
                    </div>
                  </div>
                </div>
              )}

              {nodeTypeInput === "odp" && existingOdps.length > 0 && (
                <div className="border border-cyan-100 dark:border-cyan-900/40 rounded-xl p-3 bg-cyan-50/30 dark:bg-cyan-950/20 grid gap-2">
                  <label className="block text-xs font-bold text-slate-500 mb-0">REFERENSIKAN KE DATA ODP (OPSIONAL)</label>
                  <select
                    className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                    value={linkedOdpId || ""}
                    onChange={(e) => {
                      const id = Number(e.target.value) || null;
                      setLinkedOdpId(id);
                      if (id) {
                        const odp = existingOdps.find(o => o.id === id);
                        if (odp) {
                          setNodeIdInput(`odp-${odp.id}`);
                          setNodeNameInput(odp.nama);
                          setNodeSplitterInput(odp.splitter_ratio || "1:8");
                          setNodeCapacityInput(String(odp.ports || 8));
                          setNodeNotesInput(odp.deskripsi || "");
                          if (odp.latitude && odp.longitude) {
                            setNodeLatInput(odp.latitude);
                            setNodeLngInput(odp.longitude);
                          }
                        }
                      }
                    }}
                  >
                    <option value="">-- Buat ODP Baru (tanpa referensi) --</option>
                    {existingOdps
                      .filter(odp => {
                        // Exclude ODPs already placed on the map (except the one currently being edited)
                        const isOnMap = nodes.some(n =>
                          n.node_id === `odp-${odp.id}` &&
                          (!editingNode || n.node_id !== editingNode.node_id)
                        );
                        return !isOnMap;
                      })
                      .map((odp) => (
                        <option key={odp.id} value={odp.id}>
                          {odp.nama} — {odp.splitter_ratio || "1:8"} ({odp.customer_count}/{odp.ports} port)
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px] text-cyan-700 dark:text-cyan-400 leading-snug">
                    💡 Pilih ODP yang sudah terdaftar di manajemen ODP. ODP yang sudah ada di peta tidak ditampilkan.
                  </p>
                </div>
              )}

              {(nodeTypeInput === "odc" || nodeTypeInput === "odp") && (
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-900/20 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">SPLITTER RASIO</label>
                    <select
                      className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      value={nodeSplitterInput || "1:8"}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNodeSplitterInput(val);
                        const ports = val.split(":")[1];
                        if (ports) {
                          setNodeCapacityInput(ports);
                        }
                      }}
                    >
                      <option value="1:2">1:2</option>
                      <option value="1:4">1:4</option>
                      <option value="1:8">1:8</option>
                      <option value="1:16">1:16</option>
                      <option value="1:32">1:32</option>
                      <option value="1:64">1:64</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">KAPASITAS PORT</label>
                    <input
                      type="number"
                      required
                      className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      value={nodeCapacityInput}
                      onChange={(e) => setNodeCapacityInput(e.target.value)}
                      placeholder="Contoh: 8 atau 16"
                    />
                  </div>
                  <div className="col-span-2 text-[10px] text-slate-500 flex items-center gap-1 leading-snug">
                    💡 Mengubah splitter rasio akan memperbarui kapasitas menjadi {nodeSplitterInput.split(":")[1] || "8"} port.
                  </div>
                </div>
              )}

              {nodeTypeInput === "server" && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">KAPASITAS CORES / PORT</label>
                  <input
                    type="number"
                    className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    value={nodeCapacityInput}
                    onChange={(e) => setNodeCapacityInput(e.target.value)}
                    placeholder="Contoh: 96"
                  />
                </div>
              )}

              <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-900/20 grid gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="manualCoords"
                    checked={manualCoords}
                    onChange={(e) => setManualCoords(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 bg-white border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="manualCoords" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Masukkan Koordinat Secara Manual
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">LATITUDE</label>
                    <input
                      type="number"
                      step="any"
                      required
                      readOnly={!manualCoords}
                      className={`w-full text-xs px-3 py-2 border rounded-xl font-mono ${
                        manualCoords ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                      }`}
                      value={nodeLatInput}
                      onChange={(e) => setNodeLatInput(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">LONGITUDE</label>
                    <input
                      type="number"
                      step="any"
                      required
                      readOnly={!manualCoords}
                      className={`w-full text-xs px-3 py-2 border rounded-xl font-mono ${
                        manualCoords ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                      }`}
                      value={nodeLngInput}
                      onChange={(e) => setNodeLngInput(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="text-[10px] text-indigo-600 dark:text-indigo-400 leading-normal">
                  {manualCoords
                    ? "⚠️ Anda dapat memasukkan koordinat latitude/longitude secara manual."
                    : "ℹ️ Koordinat diisi otomatis sesuai letak marker pada peta."}
                </div>
              </div>

              {/* Lock position toggle */}
              <div className="flex items-center justify-between border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2.5 bg-slate-50/50 dark:bg-slate-900/20">
                <div className="flex items-center gap-2">
                  {nodeLocked ? <Lock className="w-3.5 h-3.5 text-amber-600" /> : <Unlock className="w-3.5 h-3.5 text-slate-400" />}
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{nodeLocked ? "Posisi Terkunci" : "Posisi Tidak Terkunci"}</p>
                    <p className="text-[10px] text-slate-400 leading-snug">{nodeLocked ? "Node tidak bisa digeser di peta." : "Node bisa digeser bebas di peta."}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNodeLocked(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    nodeLocked ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    nodeLocked ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">CATATAN / INFORMASI TAMBAHAN</label>
                <textarea
                  className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  rows={2}
                  value={nodeNotesInput}
                  onChange={(e) => setNodeNotesInput(e.target.value)}
                  placeholder="Catatan pengerjaan atau kondisi fisik node..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4 mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNodeModalOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="primary"
              >
                Simpan
              </Button>
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsEdgeModalOpen(false)}
                className="!p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </Button>
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
                    className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={edgeSourceInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEdgeSourceInput(val);
                      if (val && edgeTargetInput) {
                        const srcNode = nodes.find(n => n.node_id === val);
                        const tgtNode = nodes.find(n => n.node_id === edgeTargetInput);
                        if (srcNode && tgtNode) {
                          setEdgeDistanceInput(String(calculateDistance(
                            parseLatitude(srcNode.latitude),
                            parseLongitude(srcNode.longitude),
                            parseLatitude(tgtNode.latitude),
                            parseLongitude(tgtNode.longitude)
                          )));
                        }
                      }
                    }}
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
                    className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={edgeTargetInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEdgeTargetInput(val);
                      if (edgeSourceInput && val) {
                        const srcNode = nodes.find(n => n.node_id === edgeSourceInput);
                        const tgtNode = nodes.find(n => n.node_id === val);
                        if (srcNode && tgtNode) {
                          setEdgeDistanceInput(String(calculateDistance(
                            parseLatitude(srcNode.latitude),
                            parseLongitude(srcNode.longitude),
                            parseLatitude(tgtNode.latitude),
                            parseLongitude(tgtNode.longitude)
                          )));
                        }
                      }
                    }}
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
                    className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    value={edgeFiberTypeInput}
                    onChange={(e) => setEdgeFiberTypeInput(e.target.value)}
                  >
                    <option value="server_odc">🔴 Server ke ODC</option>
                    <option value="server_odp">🟣 Server ke ODP</option>
                    <option value="odc_odp">🔵 ODC ke ODP</option>
                    <option value="odp_ont">🟢 ODP ke ONT</option>
                    <option value="ont_ont">🟡 ONT ke ONT</option>
                    <option value="other">🟠 Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ESTIMASI JARAK (METER)</label>
                  <div className="flex flex-col">
                    <input
                      type="number"
                      step="any"
                      className="w-full text-sm px-3 py-2 border rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      value={edgeDistanceInput}
                      onChange={(e) => setEdgeDistanceInput(e.target.value)}
                      placeholder="Contoh: 150"
                    />
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => {
                        if (edgeSourceInput && edgeTargetInput) {
                          const srcNode = nodes.find(n => n.node_id === edgeSourceInput);
                          const tgtNode = nodes.find(n => n.node_id === edgeTargetInput);
                          if (srcNode && tgtNode) {
                            setEdgeDistanceInput(String(calculateDistance(
                              parseLatitude(srcNode.latitude),
                              parseLongitude(srcNode.longitude),
                              parseLatitude(tgtNode.latitude),
                              parseLongitude(tgtNode.longitude)
                            )));
                            pushSuccess("Jarak berhasil dihitung dari peta.");
                          } else {
                            pushError("Node asal atau tujuan tidak ditemukan.");
                          }
                        } else {
                          pushError("Pilih node asal dan tujuan terlebih dahulu.");
                        }
                      }}
                      className="text-left mt-1 !text-[10px] !justify-start"
                    >
                      Hitung Otomatis dari Peta
                    </Button>
                  </div>
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

              {(() => {
                const srcNode = nodes.find((n) => n.node_id === edgeSourceInput);
                const tgtNode = nodes.find((n) => n.node_id === edgeTargetInput);
                if (srcNode?.type === "odp" && tgtNode?.type === "odp") {
                  return (
                    <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                      <input
                        type="checkbox"
                        id="countsAsPort"
                        checked={edgeCountsAsPort}
                        onChange={(e) => setEdgeCountsAsPort(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 bg-white border-slate-350 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="countsAsPort" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                        🔌 Gunakan / Makan Port ODP (Default: Tidak)
                      </label>
                    </div>
                  );
                }
                return null;
              })()}

              {pendingOdpAssignment && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <label className="block text-xs font-bold text-amber-700 mb-1">
                    🔌 PORT ODP UNTUK PELANGGAN INI
                  </label>
                  <p className="text-xs text-amber-600 mb-2">
                    Pelanggan ini belum punya sambungan ODP. Pilih port yang digunakan (opsional).
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={96}
                    className="w-full text-sm px-3 py-2 border border-amber-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    value={edgeOdpPortInput}
                    onChange={(e) => setEdgeOdpPortInput(e.target.value)}
                    placeholder="Nomor port (misal: 1, 2, 3...)"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t pt-4 mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEdgeModalOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="primary"
              >
                Simpan
              </Button>
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsSettingsModalOpen(false)}
                className="!p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </Button>
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
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleResetSettings()}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Reset ke Default
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSettingsModalOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                >
                  Simpan
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* --- CONFIRM RESET ALL MODAL --- */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmResetAll}
            className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl w-full max-w-md animate-in"
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Hapus Semua Data Peta
              </h3>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsResetModalOpen(false)}
                className="!p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="grid gap-3.5">
              <div className="bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 p-3.5 rounded-xl text-xs flex gap-2 border border-red-100 dark:border-red-900/30">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">PERINGATAN:</span> Tindakan ini akan menghapus <strong>SELURUH</strong> node infrastruktur dan kabel yang ada di peta jaringan secara permanen dari server. Tindakan ini tidak dapat dibatalkan.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">PASSWORD ADMIN</label>
                <input
                  type="password"
                  required
                  placeholder="Masukkan password admin Anda"
                  className="w-full text-sm px-3 py-2 border rounded-xl"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4 mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsResetModalOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={saving}
                isLoading={saving}
                loadingText="Mereset..."
              >
                Ya, Hapus Semua
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* --- CONFIRM MODAL (replaces window.confirm) --- */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl w-full max-w-sm animate-in">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {confirmModal.title}
              </h3>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmModal(null)}
                className="!p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmModal(null)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void confirmModal.onConfirm()}
              >
                Konfirmasi
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
