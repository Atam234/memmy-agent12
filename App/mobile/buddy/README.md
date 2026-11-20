# Buddy 📱

**Buddy** ang mobile app (Android at iOS) ng Memmy. Hinahayaan ka nitong makipag-chat sa Memmy agent na tumatakbo sa computer mo, mula sa phone, gamit ang parehong memorya.

Gawa ito sa [Expo](https://expo.dev) / React Native (SDK 58). Gumagamit ito ng parehong WebUI gateway protocol na gamit ng desktop app:

| Hakbang | Endpoint |
| --- | --- |
| Kumuha ng token | `GET /webui/bootstrap` (header `X-Memmy-Agent-Auth: <secret>`) |
| Listahan ng chats | `GET /api/sessions` (`Authorization: Bearer <token>`) |
| History ng isang chat | `GET /api/sessions/websocket:<chatId>/webui-thread` |
| Live chat | WebSocket: `new_chat`, `attach`, `message`, `stop` → `ready`, `attached`, `user`, `delta`, `stream_end`, `message`, `turn_end`, `error` |

## Mga feature

- Kumonekta sa Memmy sa iyong computer (address + secret key, ligtas na naka-save sa SecureStore)
- Listahan ng lahat ng usapan (pull-to-refresh)
- Gumawa ng bagong usapan
- Live streaming na sagot, kasama ang pindutang **Stop**
- Awtomatikong muling kumokonekta kapag naputol
- Light at dark mode

## 1. Ihanda ang Memmy sa computer

Bilang default, nakikinig lang ang agent gateway sa `127.0.0.1`, kaya hindi ito maaabot ng phone. Sa `~/.memmy/config.yaml`, ilagay:

```yaml
channels:
  websocket:
    enabled: true
    host: 0.0.0.0          # makinig sa LAN
    port: 18980
    tokenIssueSecret: "PALITAN-NG-MAHABANG-RANDOM-NA-SECRET"
```

Gumawa ng secret gamit ang `openssl rand -hex 32`. **Kailangan** ang `tokenIssueSecret` kapag `0.0.0.0` ang host. Hindi magsisimula ang gateway kung wala ito. I-restart ang Memmy pagkatapos.

Alamin ang IP address ng computer mo (hal. `192.168.1.10`). Ang phone at computer ay dapat nasa iisang Wi-Fi.

> ⚠️ Plain HTTP/WS ang koneksyon sa loob ng LAN. Huwag i-expose ang port 18980 sa internet. Kung kailangan mo ng remote access, gumamit ng VPN (hal. Tailscale) o HTTPS reverse proxy.

## 2. Patakbuhin ang app

```bash
cd App/mobile/buddy
npm install
npx expo start
```

I-scan ang QR code gamit ang **Expo Go** app sa phone. Sa Buddy, ilagay ang:

- **Address**: `192.168.1.10:18980`
- **Secret key**: ang `tokenIssueSecret` mo

## 3. Gumawa ng installable na app (APK / IPA)

```bash
npx eas-cli@latest build -p android --profile preview   # APK
npx eas-cli@latest build -p ios                          # kailangan ng Apple Developer account
```

Naka-set na ang `usesCleartextTraffic` (Android) at `NSAllowsLocalNetworking` (iOS) sa `app.json` para gumana ang LAN HTTP sa release builds.

## Istruktura

```
App.tsx                      # simpleng navigation: connect → chats → chat
src/api/gateway.ts           # Memmy gateway client (HTTP + WebSocket)
src/screens/ConnectScreen    # address + secret
src/screens/ChatListScreen   # listahan ng usapan
src/screens/ChatScreen       # chat na may streaming
src/storage.ts               # SecureStore para sa config
src/theme.ts                 # light/dark na kulay
```

Hiwalay ito sa root npm workspaces (sariling `package-lock.json`) para hindi magbanggaan ang React Native dependencies at ang desktop/Electron build.
