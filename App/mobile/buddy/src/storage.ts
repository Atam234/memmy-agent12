import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { GatewayConfig } from "./api/gateway";

const KEY = "buddy.gateway.v1";

export async function loadConfig(): Promise<GatewayConfig | null> {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GatewayConfig>;
    if (typeof parsed.baseUrl !== "string" || typeof parsed.secret !== "string") return null;
    return { baseUrl: parsed.baseUrl, secret: parsed.secret };
  } catch {
    return null;
  }
}

export async function saveConfig(config: GatewayConfig): Promise<void> {
  const raw = JSON.stringify(config);
  if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, raw);
  else await SecureStore.setItemAsync(KEY, raw);
}

export async function clearConfig(): Promise<void> {
  if (Platform.OS === "web") globalThis.localStorage?.removeItem(KEY);
  else await SecureStore.deleteItemAsync(KEY);
}
