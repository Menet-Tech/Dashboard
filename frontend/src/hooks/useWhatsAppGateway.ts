import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { GatewayAccount, GatewayMessage } from "../lib/gatewayApi";

type UseWhatsAppGatewayProps = {
  gatewayUrl?: string;
  apiKey?: string;
  onChatMessage?: (message: GatewayMessage) => void;
  onError?: (msg: string) => void;
};

export function useWhatsAppGateway({ gatewayUrl, apiKey, onChatMessage, onError }: UseWhatsAppGatewayProps) {
  const [socketConnected, setSocketConnected] = useState(false);
  const [accounts, setAccounts] = useState<GatewayAccount[]>([]);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const socketRef = useRef<Socket | null>(null);

  // Use a ref to store the latest callback to avoid dependency changes triggering re-connection
  const onChatMessageRef = useRef(onChatMessage);
  const onErrorRef = useRef(onError);
  const lastErrorTimeRef = useRef<number>(0);

  useEffect(() => {
    onChatMessageRef.current = onChatMessage;
  }, [onChatMessage]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!gatewayUrl) {
      setSocketConnected(false);
      return;
    }

    let socketOrigin = gatewayUrl;
    let socketPath = "/socket.io";
    try {
      if (gatewayUrl.startsWith("/")) {
        socketPath = gatewayUrl.replace(/\/$/, "") + "/socket.io";
        socketOrigin = typeof window !== "undefined" ? window.location.origin : "";
      } else if (gatewayUrl.startsWith("http")) {
        const parsed = new URL(gatewayUrl);
        socketOrigin = parsed.origin;
        if (parsed.pathname && parsed.pathname !== "/") {
          socketPath = parsed.pathname.replace(/\/$/, "") + "/socket.io";
        }
      }
    } catch (e) {
      console.error("Failed to parse gatewayUrl path:", e);
    }

    // Connect to Socket.io server
    const socket = io(socketOrigin, {
      path: socketPath,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      auth: apiKey ? { apiKey } : undefined,
      extraHeaders: apiKey ? { "X-API-Key": apiKey } : undefined,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      // Reset error timer on successful connection
      lastErrorTimeRef.current = 0;
    });

    const triggerError = (msg: string) => {
      const now = Date.now();
      // Debounce 60 seconds
      if (now - lastErrorTimeRef.current > 60000) {
        lastErrorTimeRef.current = now;
        if (onErrorRef.current) {
          onErrorRef.current(msg);
        }
      }
    };

    socket.on("connect_error", () => {
      setSocketConnected(false);
      triggerError("Koneksi ke WhatsApp Gateway gagal. Sistem akan mencoba kembali secara otomatis.");
    });

    socket.on("disconnect", (reason) => {
      setSocketConnected(false);
      if (reason !== "io client disconnect") {
        triggerError("Koneksi WebSocket ke WhatsApp Gateway terputus.");
      }
    });

    socket.on("qr_code", (data: { accountId: string; qr: string }) => {
      setQrs((prev) => ({ ...prev, [data.accountId]: data.qr }));
    });

    socket.on(
      "account_status",
      (data: { accountId: string; ready: boolean; hasQr: boolean }) => {
        setAccounts((prev) => {
          const index = prev.findIndex((acc) => acc.accountId === data.accountId);
          if (index > -1) {
            const next = [...prev];
            next[index] = {
              accountId: data.accountId,
              ready: data.ready,
              hasQr: data.hasQr,
            };
            return next;
          } else {
            return [
              ...prev,
              {
                accountId: data.accountId,
                ready: data.ready,
                hasQr: data.hasQr,
              },
            ];
          }
        });

        // If it's ready, clear the QR code
        if (data.ready) {
          setQrs((prev) => {
            const next = { ...prev };
            delete next[data.accountId];
            return next;
          });
        }
      }
    );

    socket.on("account_removed", (data: { accountId: string }) => {
      setAccounts((prev) => prev.filter((acc) => acc.accountId !== data.accountId));
      setQrs((prev) => {
        const next = { ...prev };
        delete next[data.accountId];
        return next;
      });
    });

    socket.on("chat_message", (message: GatewayMessage) => {
      if (onChatMessageRef.current) {
        onChatMessageRef.current(message);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [gatewayUrl, apiKey]);

  return {
    socketConnected,
    accounts,
    setAccounts,
    qrs,
    setQrs,
  };
}
