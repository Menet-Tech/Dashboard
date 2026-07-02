import { request } from "./api";

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

export type AutoReplyRule = {
  id: string;
  account_id: string;
  keyword: string;
  reply: string;
  match_type: "exact" | "contains" | "startsWith" | "endsWith" | "regex";
  enabled: boolean;
  priority: number;
  image_path?: string;
  created_at: string;
  updated_at?: string;
};

export type ChatbotSettings = {
  chatbot_account_id: string;
  auto_reply_account_id: string;
  auto_reply_before_chatbot: string;
  chatbot_enabled?: string;
};

async function gatewayRequest<T>(
  url: string,
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const cleanUrl = url.replace(/\/$/, "");
  const traceId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  
  const headers: HeadersInit = {
    Accept: "application/json",
    "X-API-Key": apiKey,
    "X-Request-Id": traceId,
    ...(options.headers ?? {}),
  };
  
  if (!(options.body instanceof FormData)) {
    (headers as any)["Content-Type"] = "application/json";
  }

  const response = await fetch(`${cleanUrl}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const responseTraceId = response.headers.get("X-Request-Id") ?? payload?.requestId ?? payload?.request_id ?? traceId;
    const message = payload?.message ?? `Gateway request failed with status ${response.status}`;
    throw new Error(
      responseTraceId ? `${message} (trace: ${responseTraceId})` : message
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
  return request<{ status: string; count: number; data: ContactForm[] }>(
    `/api/v1/chatbot/forms?limit=${limit}${typeParam}`
  );
}

export function getAutoReplyRules(url: string, apiKey: string, accountId?: string) {
  const accountParam = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return gatewayRequest<{ data: AutoReplyRule[] }>(url, apiKey, `/api/v1/autoreply${accountParam}`);
}

export function createAutoReplyRule(
  url: string,
  apiKey: string,
  payload: FormData | {
    accountId?: string;
    keyword: string;
    reply: string;
    matchType: AutoReplyRule["match_type"];
    enabled?: boolean;
    priority?: number;
  }
) {
  const body = payload instanceof FormData ? payload : JSON.stringify(payload);
  return gatewayRequest<{ data: AutoReplyRule }>(url, apiKey, "/api/v1/autoreply", {
    method: "POST",
    body,
  });
}

export function updateAutoReplyRule(
  url: string,
  apiKey: string,
  id: string,
  payload: FormData | Partial<{
    accountId: string;
    keyword: string;
    reply: string;
    matchType: AutoReplyRule["match_type"];
    enabled: boolean;
    priority: number;
  }>
) {
  const body = payload instanceof FormData ? payload : JSON.stringify(payload);
  return gatewayRequest<{ data: AutoReplyRule }>(url, apiKey, `/api/v1/autoreply/${id}`, {
    method: "PATCH",
    body,
  });
}

export function deleteAutoReplyRule(url: string, apiKey: string, id: string) {
  return gatewayRequest<{ data: AutoReplyRule }>(url, apiKey, `/api/v1/autoreply/${id}`, {
    method: "DELETE",
  });
}

export function getChatbotSettings(url: string, apiKey: string) {
  return gatewayRequest<{ data: ChatbotSettings }>(url, apiKey, "/api/v1/chatbot/settings");
}

export function updateChatbotSettings(url: string, apiKey: string, payload: ChatbotSettings) {
  return gatewayRequest<{ data: ChatbotSettings }>(url, apiKey, "/api/v1/chatbot/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function updateChatbotForm(
  url: string,
  apiKey: string,
  id: string,
  status: "pending" | "resolved"
) {
  return request<{ data: ContactForm }>(
    `/api/v1/chatbot/forms/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}

export function createChatbotForm(
  url: string,
  apiKey: string,
  payload: {
    type: "registration" | "support";
    phone: string;
    account_id?: string;
    data: Record<string, any>;
  }
) {
  return request<{ data: { id: string } }>("/api/v1/chatbot/forms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteChatbotForm(url: string, apiKey: string, id: string) {
  return request<{ message: string }>(
    `/api/v1/chatbot/forms/${id}`,
    { method: "DELETE" }
  );
}

