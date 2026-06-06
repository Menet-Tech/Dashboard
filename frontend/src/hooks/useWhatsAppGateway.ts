import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { GatewayAccount, GatewayMessage } from "../lib/gatewayApi";

type UseWhatsAppGatewayProps = {
  gatewayUrl?: string;
  apiKey?: string;
  onChatMessage?: (message: GatewayMessage) => void;
};

export function useWhatsAppGateway({ gatewayUrl, apiKey, onChatMessage }: UseWhatsAppGatewayProps) {
  const [socketConnected, setSocketConnected] = useState(false);
  const [accounts, setAccounts] = useState<GatewayAccount[]>([]);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const socketRef = useRef<Socket | null>(null);

  // Use a ref to store the latest callback to avoid dependency changes triggering re-connection
  const onChatMessageRef = useRef(onChatMessage);
  useEffect(() => {
    onChatMessageRef.current = onChatMessage;
  }, [onChatMessage]);

  useEffect(() => {
    if (!gatewayUrl) {
      setSocketConnected(false);
      return;
    }

    // Connect to Socket.io server
    const socket = io(gatewayUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      auth: apiKey ? { apiKey } : undefined,
      extraHeaders: apiKey ? { "X-API-Key": apiKey } : undefined,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
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
