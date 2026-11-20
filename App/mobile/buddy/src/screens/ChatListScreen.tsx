import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GatewayError, type BuddyGateway, type ChatSummary } from "../api/gateway";
import { useTheme } from "../theme";

interface Props {
  gateway: BuddyGateway;
  online: boolean;
  onOpenChat: (chatId: string, title: string) => void;
  onDisconnect: () => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ChatListScreen({ gateway, online, onOpenChat, onDisconnect }: Props) {
  const t = useTheme();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setChats(await gateway.listChats());
      setError(null);
    } catch (e) {
      setError(e instanceof GatewayError ? e.message : "Hindi ma-load ang mga usapan.");
    }
  }, [gateway]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function newChat() {
    setCreating(true);
    try {
      const chatId = await gateway.newChat();
      onOpenChat(chatId, "Bagong usapan");
    } catch (e) {
      setError(e instanceof GatewayError ? e.message : "Hindi nakagawa ng bagong usapan.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={["top", "left", "right"]}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <View>
          <Text style={[styles.title, { color: t.text }]}>Buddy</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: online ? t.online : t.offline }]} />
            <Text style={[styles.status, { color: t.muted }]} numberOfLines={1}>
              {online ? `Konektado${gateway.modelName ? ` · ${gateway.modelName}` : ""}` : "Kumokonekta ulit…"}
            </Text>
          </View>
        </View>
        <Pressable onPress={onDisconnect} hitSlop={12}>
          <Text style={[styles.link, { color: t.muted }]}>Idiskonekta</Text>
        </Pressable>
      </View>

      {error ? <Text style={[styles.error, { color: t.error }]}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={t.accent} />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} />}
          contentContainerStyle={chats.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.muted }]}>Wala pang usapan. Pindutin ang “+ Bago” para magsimula.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onOpenChat(item.chatId, item.title)}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.border : t.surface, borderColor: t.border }]}
            >
              <View style={styles.rowTop}>
                <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.rowTime, { color: t.muted }]}>{formatTime(item.updatedAt)}</Text>
              </View>
              {item.preview ? <Text style={[styles.rowPreview, { color: t.muted }]} numberOfLines={2}>{item.preview}</Text> : null}
            </Pressable>
          )}
        />
      )}

      <Pressable
        onPress={newChat}
        disabled={creating || !online}
        style={({ pressed }) => [styles.fab, { backgroundColor: t.accent, opacity: pressed || creating || !online ? 0.6 : 1 }]}
      >
        {creating ? <ActivityIndicator color={t.accentText} /> : <Text style={[styles.fabText, { color: t.accentText }]}>+ Bago</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 28, fontWeight: "800" },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2, maxWidth: 240 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  status: { fontSize: 13 },
  link: { fontSize: 14 },
  error: { paddingHorizontal: 16, paddingTop: 10, fontSize: 14 },
  loader: { marginTop: 40 },
  listContent: { padding: 16, paddingBottom: 100, gap: 10 },
  emptyContainer: { flexGrow: 1, justifyContent: "center", padding: 32 },
  empty: { textAlign: "center", fontSize: 15, lineHeight: 21 },
  row: { borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: "600", flex: 1 },
  rowTime: { fontSize: 12 },
  rowPreview: { fontSize: 14, marginTop: 4, lineHeight: 19 },
  fab: { position: "absolute", right: 20, bottom: 32, borderRadius: 28, paddingHorizontal: 22, paddingVertical: 14, minWidth: 96, alignItems: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  fabText: { fontSize: 16, fontWeight: "700" },
});
