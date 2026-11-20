/**
 * Buddy ↔ memmy-agent gateway client.
 *
 * Speaks the same WebUI protocol the Memmy desktop app uses:
 *   1. GET  /webui/bootstrap  (header X-Memmy-Agent-Auth: <secret>) → short-lived token + ws_path
 *   2. GET  /api/sessions                    (Authorization: Bearer <token>) → chat list
 *   3. GET  /api/sessions/:key/webui-thread  (Authorization: Bearer <token>) → chat history
 *   4. WebSocket <ws_path>?token=…&client_id=… → new_chat / attach / message / stop frames,
 *      and ready / attached / user / delta / stream_end / message / turn_end / error events.
 */

export interface GatewayConfig {
  baseUrl: string;
  secret: string;
}

export interface Bootstrap {
  token: string;
  ws_path: string;
  expires_in: number;
  model_name: string | null;
}

export interface ChatSummary {
  key: string;
  chatId: string;
  title: string;
  preview: string;
  updatedAt: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  streaming?: boolean;
}

export type GatewayEvent = Record<string, unknown> & { event: string; chat_id?: string };

export class GatewayError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
    this.name = "GatewayError";
  }
}

export function normalizeBaseUrl(raw: string): string {
  let value = raw.trim();
  if (!value) return value;
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value.replace(/\/+$/, "");
}

export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function chatIdFromKey(key: string): string {
  return key.startsWith("websocket:") ? key.slice("websocket:".length) : key;
}

const REQUEST_TIMEOUT_MS = 10_000;

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new GatewayError(aborted ? "Hindi maabot ang Memmy (timeout)." : "Hindi maabot ang Memmy. Tingnan ang address at Wi-Fi.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const hint =
      response.status === 401 ? "Mali ang secret key." :
      response.status === 403 ? "Tinanggihan ng Memmy ang koneksyon (kailangan ng tokenIssueSecret)." :
      response.status === 503 ? "Nagsisimula pa ang Memmy agent. Subukan ulit." :
      `Error ${response.status}`;
    throw new GatewayError(hint, response.status);
  }
  return response.json();
}

export class BuddyGateway {
  private boot: Bootstrap | null = null;
  private bootExpiresAt = 0;
  private socket: WebSocket | null = null;
  private socketReady: Promise<void> | null = null;
  private listeners = new Set<(event: GatewayEvent) => void>();
  private statusListeners = new Set<(online: boolean) => void>();
  private readonly clientId = uuid();
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attached = new Set<string>();

  readonly config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  get modelName(): string | null {
    return this.boot?.model_name ?? null;
  }

  async bootstrap(force = false): Promise<Bootstrap> {
    if (!force && this.boot && Date.now() < this.bootExpiresAt - 60_000) return this.boot;
    const raw = (await fetchJson(`${this.config.baseUrl}/webui/bootstrap`, {
      headers: { "X-Memmy-Agent-Auth": this.config.secret },
    })) as Partial<Bootstrap>;
    if (typeof raw?.token !== "string" || typeof raw.ws_path !== "string") {
      throw new GatewayError("Hindi Memmy agent ang sumagot sa address na ito.");
    }
    this.boot = {
      token: raw.token,
      ws_path: raw.ws_path,
      expires_in: Number(raw.expires_in ?? 0),
      model_name: raw.model_name ?? null,
    };
    this.bootExpiresAt = Date.now() + this.boot.expires_in * 1000;
    return this.boot;
  }

  private async authedJson(path: string): Promise<unknown> {
    const boot = await this.bootstrap();
    try {
      return await fetchJson(`${this.config.baseUrl}${path}`, { headers: { Authorization: `Bearer ${boot.token}` } });
    } catch (error) {
      if (error instanceof GatewayError && error.status === 401) {
        const fresh = await this.bootstrap(true);
        return fetchJson(`${this.config.baseUrl}${path}`, { headers: { Authorization: `Bearer ${fresh.token}` } });
      }
      throw error;
    }
  }

  async listChats(): Promise<ChatSummary[]> {
    const raw = (await this.authedJson("/api/sessions")) as { sessions?: Array<Record<string, unknown>> };
    const sessions = Array.isArray(raw?.sessions) ? raw.sessions : [];
    return sessions
      .filter((s) => typeof s.key === "string")
      .map((s) => ({
        key: String(s.key),
        chatId: chatIdFromKey(String(s.key)),
        title: typeof s.title === "string" && s.title.trim() ? s.title : "Bagong usapan",
        preview: typeof s.preview === "string" ? s.preview : "",
        updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : null,
      }))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  async loadHistory(chatId: string): Promise<ChatMessage[]> {
    const key = encodeURIComponent(`websocket:${chatId}`);
    const raw = (await this.authedJson(`/api/sessions/${key}/webui-thread`)) as { messages?: GatewayEvent[] };
    const messages: ChatMessage[] = [];
    let streaming: ChatMessage | null = null;
    for (const event of Array.isArray(raw?.messages) ? raw.messages : []) {
      streaming = applyEvent(messages, streaming, event);
    }
    return messages.map((m) => ({ ...m, streaming: false }));
  }

  // ---------------------------------------------------------------- WebSocket

  onEvent(listener: (event: GatewayEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: (online: boolean) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emitStatus(online: boolean) {
    this.statusListeners.forEach((l) => l(online));
  }

  connect(): Promise<void> {
    if (this.socketReady) return this.socketReady;
    this.closedByUser = false;
    this.socketReady = (async () => {
      const boot = await this.bootstrap(true);
      const wsBase = this.config.baseUrl.replace(/^http/i, "ws");
      const path = boot.ws_path.startsWith("/") ? boot.ws_path : `/${boot.ws_path}`;
      const url = `${wsBase}${path}?token=${encodeURIComponent(boot.token)}&client_id=${encodeURIComponent(this.clientId)}&client_surface=gui`;
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url);
        this.socket = socket;
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new GatewayError("Hindi makakonekta sa Memmy (WebSocket timeout)."));
            socket.close();
          }
        }, REQUEST_TIMEOUT_MS);
        socket.onmessage = (msg) => {
          let event: GatewayEvent;
          try {
            event = JSON.parse(String(msg.data));
          } catch {
            return;
          }
          if (event.event === "ready" && !settled) {
            settled = true;
            clearTimeout(timer);
            this.emitStatus(true);
            this.attached.forEach((chatId) => this.sendFrame({ type: "attach", chat_id: chatId }));
            resolve();
          }
          this.listeners.forEach((l) => l(event));
        };
        socket.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new GatewayError("Hindi makakonekta sa Memmy (WebSocket)."));
          }
        };
        socket.onclose = () => {
          clearTimeout(timer);
          if (this.socket === socket) {
            this.socket = null;
            this.socketReady = null;
            this.emitStatus(false);
            if (!this.closedByUser) this.scheduleReconnect();
          }
        };
      });
    })().catch((error) => {
      this.socketReady = null;
      throw error;
    });
    return this.socketReady;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this.scheduleReconnect());
    }, 3000);
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.socketReady = null;
  }

  private sendFrame(frame: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new GatewayError("Offline — hindi konektado sa Memmy.");
    }
    this.socket.send(JSON.stringify(frame));
  }

  async newChat(): Promise<string> {
    await this.connect();
    const requestId = uuid();
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new GatewayError("Hindi nakagawa ng bagong usapan (timeout)."));
      }, REQUEST_TIMEOUT_MS);
      const off = this.onEvent((event) => {
        if (event.client_request_id !== requestId) return;
        if (event.event === "attached" && typeof event.chat_id === "string") {
          clearTimeout(timer);
          off();
          this.attached.add(event.chat_id);
          resolve(event.chat_id);
        } else if (event.event === "error") {
          clearTimeout(timer);
          off();
          reject(new GatewayError(String(event.reason ?? event.detail ?? "new_chat_rejected")));
        }
      });
      this.sendFrame({ type: "new_chat", client_request_id: requestId });
    });
  }

  async attach(chatId: string) {
    await this.connect();
    this.attached.add(chatId);
    this.sendFrame({ type: "attach", chat_id: chatId });
  }

  detach(chatId: string) {
    this.attached.delete(chatId);
  }

  async sendMessage(chatId: string, content: string): Promise<string> {
    await this.connect();
    const requestId = uuid();
    this.sendFrame({ type: "message", chat_id: chatId, content, webui: true, client_request_id: requestId });
    return requestId;
  }

  stop(chatId: string) {
    try {
      this.sendFrame({ type: "stop", chat_id: chatId });
    } catch {
      // offline: nothing to stop
    }
  }
}

/**
 * Folds one gateway event into the message list (mutates `messages`).
 * Returns the assistant message that is currently streaming, if any.
 */
export function applyEvent(messages: ChatMessage[], streaming: ChatMessage | null, event: GatewayEvent): ChatMessage | null {
  const text = typeof event.text === "string" ? event.text : typeof event.content === "string" ? event.content : "";
  switch (event.event) {
    case "user": {
      const requestId = typeof event.client_request_id === "string" ? event.client_request_id : null;
      if (requestId && messages.some((m) => m.id === requestId)) return streaming;
      messages.push({ id: requestId ?? uuid(), role: "user", text });
      return streaming;
    }
    case "delta": {
      if (!streaming) {
        streaming = { id: uuid(), role: "assistant", text: "", streaming: true };
        messages.push(streaming);
      }
      streaming.text += text;
      return streaming;
    }
    case "stream_end": {
      if (streaming) {
        if (text && !streaming.text) streaming.text = text;
        streaming.streaming = false;
      } else if (text) {
        messages.push({ id: uuid(), role: "assistant", text });
      }
      return null;
    }
    case "message": {
      if (!text.trim()) return null;
      const last = messages[messages.length - 1];
      // The final `message` usually repeats the streamed text; replace instead of duplicating.
      if (streaming) {
        streaming.text = text;
        streaming.streaming = false;
      } else if (last && last.role === "assistant" && last.text.trim() === text.trim()) {
        // duplicate of a just-finished stream
      } else {
        messages.push({ id: uuid(), role: "assistant", text });
      }
      return null;
    }
    case "turn_end": {
      if (streaming) streaming.streaming = false;
      return null;
    }
    case "error": {
      const detail = String(event.reason ?? event.detail ?? "error");
      messages.push({ id: uuid(), role: "error", text: `May problema: ${detail}` });
      if (streaming) streaming.streaming = false;
      return null;
    }
    default:
      return streaming;
  }
}
