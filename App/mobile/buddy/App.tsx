import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BuddyGateway, type GatewayConfig } from "./src/api/gateway";
import { ChatListScreen } from "./src/screens/ChatListScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import { clearConfig, loadConfig, saveConfig } from "./src/storage";
import { useTheme } from "./src/theme";

type Route = { name: "connect" } | { name: "chats" } | { name: "chat"; chatId: string; title: string };

export default function App() {
  const t = useTheme();
  const [booting, setBooting] = useState(true);
  const [saved, setSaved] = useState<GatewayConfig | null>(null);
  const [gateway, setGateway] = useState<BuddyGateway | null>(null);
  const [online, setOnline] = useState(false);
  const [route, setRoute] = useState<Route>({ name: "connect" });

  // Auto-reconnect with the saved address/secret on launch.
  useEffect(() => {
    (async () => {
      const config = await loadConfig();
      setSaved(config);
      if (config) {
        const gw = new BuddyGateway(config);
        try {
          await gw.connect();
          setGateway(gw);
          setRoute({ name: "chats" });
        } catch {
          gw.disconnect();
        }
      }
      setBooting(false);
    })();
  }, []);

  useEffect(() => {
    if (!gateway) return;
    setOnline(true);
    return gateway.onStatus(setOnline);
  }, [gateway]);

  // Android hardware back button: chat → list.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (route.name === "chat") {
        setRoute({ name: "chats" });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [route]);

  async function handleConnected(gw: BuddyGateway) {
    await saveConfig(gw.config);
    setSaved(gw.config);
    setGateway(gw);
    setRoute({ name: "chats" });
  }

  async function handleDisconnect() {
    gateway?.disconnect();
    setGateway(null);
    await clearConfig();
    setRoute({ name: "connect" });
  }

  let screen;
  if (booting) {
    screen = (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  } else if (!gateway || route.name === "connect") {
    screen = <ConnectScreen initial={saved} onConnected={handleConnected} />;
  } else if (route.name === "chat") {
    screen = (
      <ChatScreen
        key={route.chatId}
        gateway={gateway}
        chatId={route.chatId}
        title={route.title}
        online={online}
        onBack={() => setRoute({ name: "chats" })}
      />
    );
  } else {
    screen = (
      <ChatListScreen
        gateway={gateway}
        online={online}
        onOpenChat={(chatId, title) => setRoute({ name: "chat", chatId, title })}
        onDisconnect={handleDisconnect}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {screen}
    </SafeAreaProvider>
  );
}
