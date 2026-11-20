import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BuddyGateway, GatewayError, normalizeBaseUrl, type GatewayConfig } from "../api/gateway";
import { useTheme } from "../theme";

interface Props {
  initial: GatewayConfig | null;
  onConnected: (gateway: BuddyGateway) => void;
}

export function ConnectScreen({ initial, onConnected }: Props) {
  const t = useTheme();
  const [address, setAddress] = useState(initial?.baseUrl ?? "");
  const [secret, setSecret] = useState(initial?.secret ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    const baseUrl = normalizeBaseUrl(address);
    if (!baseUrl || !secret.trim()) {
      setError("Ilagay ang address at secret key.");
      return;
    }
    setBusy(true);
    setError(null);
    const gateway = new BuddyGateway({ baseUrl, secret: secret.trim() });
    try {
      await gateway.bootstrap(true);
      await gateway.connect();
      onConnected(gateway);
    } catch (e) {
      gateway.disconnect();
      setError(e instanceof GatewayError ? e.message : "Hindi makakonekta.");
    } finally {
      setBusy(false);
    }
  }

  const input = [styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.border }];

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.container}>
          <Image source={require("../../assets/icon.png")} style={styles.logo} accessibilityIgnoresInvertColors />
          <Text style={[styles.title, { color: t.text }]}>Buddy</Text>
          <Text style={[styles.subtitle, { color: t.muted }]}>
            Ang iyong Memmy agent, nasa bulsa mo. Ikonekta sa Memmy na tumatakbo sa iyong computer.
          </Text>

          <Text style={[styles.label, { color: t.muted }]}>Address ng computer</Text>
          <TextInput
            style={input}
            value={address}
            onChangeText={setAddress}
            placeholder="192.168.1.10:18980"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={[styles.label, { color: t.muted }]}>Secret key (tokenIssueSecret)</Text>
          <TextInput
            style={input}
            value={secret}
            onChangeText={setSecret}
            placeholder="••••••••"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            onSubmitEditing={connect}
          />

          {error ? <Text style={[styles.error, { color: t.error }]}>{error}</Text> : null}

          <Pressable
            onPress={connect}
            disabled={busy}
            style={({ pressed }) => [styles.button, { backgroundColor: t.accent, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            {busy ? <ActivityIndicator color={t.accentText} /> : <Text style={[styles.buttonText, { color: t.accentText }]}>Kumonekta</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 24, maxWidth: 480, width: "100%", alignSelf: "center" },
  logo: { width: 72, height: 72, borderRadius: 20, alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 32, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 15, textAlign: "center", marginTop: 8, marginBottom: 32, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  error: { marginTop: 14, fontSize: 14 },
  button: { marginTop: 24, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  buttonText: { fontSize: 16, fontWeight: "700" },
});
