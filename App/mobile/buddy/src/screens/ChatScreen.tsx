import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { applyEvent, GatewayError, type BuddyGateway, type ChatMessage } from "../api/gateway";
import { useTheme } from "../theme";

interface Props {
  gateway: BuddyGateway;
  chatId: string;
  title: string;
  online: boolean;
  onBack: () => void;
}

export function ChatScreen({ gateway, chatId, title, online, onBack }: Props) {
  const t = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const store = useRef<{ messages: ChatMessage[]; streaming: ChatMessage | null }>({ messages: [], streaming: null });

  const publish = () => setMessages(store.current.messages.map((m) => ({ ...m })));

  useEffect(() => {
    let cancelled = false;
    const off = gateway.onEvent((event) => {
      if (event.chat_id !== chatId) return;
      store.current.streaming = applyEvent(store.current.messages, store.current.streaming, event);
      if (event.event === "delta") setBusy(true);
      if (event.event === "turn_end" || event.event === "error" || event.event === "stop_result") setBusy(false);
      publish();
    });
    (async () => {
      try {
        const history = await gateway.loadHistory(chatId);
        if (!cancelled) {
          store.current.messages = [...history, ...store.current.messages];
          publish();
        }
      } catch {
        // A brand-new chat has no history yet.
      }
      try {
        await gateway.attach(chatId);
      } catch {
        // reconnect loop will re-attach
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      off();
      gateway.detach(chatId);
    };
  }, [gateway, chatId]);

  async function send() {
    const content = draft.trim();
    if (!content || busy) return;
    setDraft("");
    setBusy(true);
    try {
      const id = await gateway.sendMessage(chatId, content);
      store.current.messages.push({ id, role: "user", text: content });
      publish();
    } catch (e) {
      setBusy(false);
      setDraft(content);
      store.current.messages.push({ id: `err-${Date.now()}`, role: "error", text: e instanceof GatewayError ? e.message : "Hindi naipadala." });
      publish();
    }
  }

  function stop() {
    gateway.stop(chatId);
    setBusy(false);
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
          <Text style={[styles.backText, { color: t.accent }]}>‹ Bumalik</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{title}</Text>
        <View style={[styles.dot, { backgroundColor: online ? t.online : t.offline }]} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={t.accent} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={<Text style={[styles.empty, { color: t.muted }]}>Kumusta! Ano ang maitutulong ko?</Text>}
            renderItem={({ item }) => {
              const mine = item.role === "user";
              const isError = item.role === "error";
              return (
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.mine : styles.theirs,
                    {
                      backgroundColor: mine ? t.userBubble : t.botBubble,
                      borderColor: isError ? t.error : t.border,
                      borderWidth: mine ? 0 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Text selectable style={[styles.bubbleText, { color: mine ? t.userText : isError ? t.error : t.text }]}>
                    {item.text || (item.streaming ? "…" : "")}
                  </Text>
                </View>
              );
            }}
          />
        )}

        {busy ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color={t.muted} />
            <Text style={[styles.thinking, { color: t.muted }]}>Nag-iisip si Buddy…</Text>
          </View>
        ) : null}

        <View style={[styles.composer, { borderTopColor: t.border, backgroundColor: t.bg }]}>
          <TextInput
            style={[styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.border }]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Mag-type ng mensahe…"
            placeholderTextColor={t.muted}
            multiline
          />
          {busy ? (
            <Pressable onPress={stop} style={[styles.send, { backgroundColor: t.muted }]}>
              <Text style={[styles.sendText, { color: t.bg }]}>■</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={send}
              disabled={!draft.trim() || !online}
              style={[styles.send, { backgroundColor: t.accent, opacity: draft.trim() && online ? 1 : 0.4 }]}
            >
              <Text style={[styles.sendText, { color: t.accentText }]}>↑</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  back: { minWidth: 80 },
  backText: { fontSize: 16, fontWeight: "600" },
  title: { flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 72 },
  loader: { marginTop: 40 },
  list: { padding: 12, gap: 8, flexGrow: 1 },
  empty: { textAlign: "center", marginTop: 48, fontSize: 15 },
  bubble: { maxWidth: "85%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: "flex-end", borderBottomRightRadius: 6 },
  theirs: { alignSelf: "flex-start", borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  thinking: { fontSize: 13 },
  composer: { flexDirection: "row", alignItems: "flex-end", padding: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16, maxHeight: 140 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  sendText: { fontSize: 20, fontWeight: "800" },
});
