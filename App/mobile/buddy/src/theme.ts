import { useColorScheme } from "react-native";

const light = {
  bg: "#F7F6F2",
  surface: "#FFFFFF",
  text: "#1C1B19",
  muted: "#6B6862",
  border: "#E4E1DA",
  accent: "#E8743B",
  accentText: "#FFFFFF",
  userBubble: "#E8743B",
  userText: "#FFFFFF",
  botBubble: "#FFFFFF",
  error: "#C2410C",
  online: "#16A34A",
  offline: "#9CA3AF",
};

const dark: typeof light = {
  bg: "#141311",
  surface: "#1F1E1B",
  text: "#F2F0EB",
  muted: "#A19D95",
  border: "#33312C",
  accent: "#F08A55",
  accentText: "#1C1B19",
  userBubble: "#F08A55",
  userText: "#1C1B19",
  botBubble: "#26241F",
  error: "#FB923C",
  online: "#22C55E",
  offline: "#6B7280",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
