export type GatewayAccount = {
  accountId: string;
  ready: boolean;
  hasQr: boolean;
};

export type GatewayMessage = {
  id: string;
  to_number: string;
  body: string;
  type: string;
  status: string;
  wa_message_id: string | null;
  created_at: string;
  sent_at: string | null;
  direction: "inbound" | "outbound";
  from_number: string | null;
  account_id: string;
};

export type ChatbotSession = {
  phone: string;
  account_id: string;
  state: string;
  form_data: Record<string, any>;
  updated_at: string;
};

export type ContactForm = {
  id: string;
  type: "registration" | "support";
  phone: string;
  account_id: string;
  data: Record<string, any>;
  status: "pending" | "resolved";
  created_at: string;
};

async function gatewayRequest<T>(
  url: string,
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const cleanUrl = url.replace(/\/$/, "");
  const response = await fetch(`${cleanUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message ?? `Gateway request failed with status ${response.status}`
    );
  }

  return payload as T;
}

export function getGatewayAccounts(url: string, apiKey: string) {
  return gatewayRequest<{ data: GatewayAccount[] }>(url, apiKey, "/api/v1/accounts");
}

export function createGatewayAccount(
  url: string,
  apiKey: string,
  accountId: string,
  label: string
) {
  return gatewayRequest<{ message: string }>(url, apiKey, "/api/v1/accounts", {
    method: "POST",
    body: JSON.stringify({ accountId, label }),
  });
}

export function deleteGatewayAccount(url: string, apiKey: string, accountId: string) {
  return gatewayRequest<{ message: string }>(url, apiKey, `/api/v1/accounts/${accountId}`, {
    method: "DELETE",
  });
}

export function getGatewayAccountQr(url: string, apiKey: string, accountId: string) {
  return gatewayRequest<{ data: { qr: string } }>(
    url,
    apiKey,
    `/api/v1/accounts/${accountId}/qr`
  );
}

export function getGatewayHistory(
  url: string,
  apiKey: string,
  accountId: string | null,
  limit = 100
) {
  const headers: Record<string, string> = {};
  if (accountId) {
    headers["X-Account-Id"] = accountId;
  }
  return gatewayRequest<{ data: GatewayMessage[] }>(
    url,
    apiKey,
    `/api/v1/messages/history?limit=${limit}`,
    { headers }
  );
}

export function getChatbotSessions(url: string, apiKey: string) {
  return gatewayRequest<{ data: ChatbotSession[] }>(url, apiKey, "/api/v1/chatbot/sessions");
}

export function resetChatbotSession(url: string, apiKey: string, phone: string) {
  return gatewayRequest<{ message: string }>(
    url,
    apiKey,
    `/api/v1/chatbot/sessions/${encodeURIComponent(phone)}`,
    { method: "DELETE" }
  );
}

export function getChatbotForms(
  url: string,
  apiKey: string,
  type?: "registration" | "support",
  limit = 50
) {
  const typeParam = type ? `&type=${type}` : "";
  return gatewayRequest<{ data: ContactForm[] }>(
    url,
    apiKey,
    `/api/v1/chatbot/forms?limit=${limit}${typeParam}`
  );
}
