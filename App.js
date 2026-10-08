import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';

const locationBridge = `
(function () {
  if (!window.ReactNativeWebView) return;
  const callbacks = new Map();
  let nextId = 1;
  function send(action, id, options) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'agri-location', action, id, options }));
  }
  function response(message) {
    const entry = callbacks.get(message.id);
    if (!entry) return;
    if (message.error) {
      callbacks.delete(message.id);
      if (entry.error) entry.error({ code: message.error.code, message: message.error.message });
      return;
    }
    const position = { coords: message.position, timestamp: message.position.timestamp };
    if (entry.watch) entry.success(position);
    else {
      callbacks.delete(message.id);
      entry.success(position);
    }
  }
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success, error, options) {
        const id = nextId++;
        callbacks.set(id, { success, error, watch: false });
        send('current', id, options || {});
      },
      watchPosition(success, error, options) {
        const id = nextId++;
        callbacks.set(id, { success, error, watch: true });
        send('watch', id, options || {});
        return id;
      },
      clearWatch(id) {
        callbacks.delete(id);
        send('clear', id, {});
      }
    }
  });
  window.__agriLocationResponse = response;
})(); true;
`;

function errorCode(error) {
  if (error?.code === 'E_LOCATION_UNAUTHORIZED') return 1;
  if (error?.code === 'E_LOCATION_TIMEOUT') return 3;
  return 2;
}

function locationOptions(options = {}) {
  return {
    accuracy: options.enableHighAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: true,
  };
}

function getAppUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_SERVER_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;

  try {
    const hostname = new URL(`http://${hostUri}`).hostname;
    if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return null;
    return `http://${hostname}:3000`;
  } catch {
    return null;
  }
}

function ConnectionHelp({ onRetry, missingServer }) {
  return (
    <View style={styles.help}>
      <Text style={styles.title}>Can't connect to AgriConnect</Text>
      <Text style={styles.message}>
        {missingServer
          ? 'Start the Expo app in LAN mode and make sure your phone and computer are on the same Wi-Fi network.'
          : 'Check that the AgriConnect server is running on your computer, both devices are on the same Wi-Fi, and your firewall allows Node.js.'}
      </Text>
      <TouchableOpacity accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const appUrl = getAppUrl();
  const webView = useRef(null);
  const watches = useRef(new Map());

  const sendLocationResult = (id, result) => {
    const payload = JSON.stringify({ id, ...result });
    webView.current?.injectJavaScript(`window.__agriLocationResponse?.(${payload}); true;`);
  };

  const handleLocationMessage = async (event) => {
    let message;
    try {
      if (new URL(event.nativeEvent.url).origin !== new URL(appUrl).origin) return;
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type !== 'agri-location' || !Number.isInteger(message.id)) return;

    if (message.action === 'clear') {
      const watch = watches.current.get(message.id);
      if (watch) {
        watch.cancelled = true;
        watch.subscription?.remove();
        watches.current.delete(message.id);
      }
      return;
    }
    if (message.action !== 'current' && message.action !== 'watch') return;

    const watch = message.action === 'watch' ? { cancelled: false, subscription: null } : null;
    if (watch) watches.current.set(message.id, watch);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw Object.assign(new Error('Location permission was denied.'), { code: 'E_LOCATION_UNAUTHORIZED' });
      }
      if (watch?.cancelled) return;

      const options = locationOptions(message.options);
      if (message.action === 'current') {
        const timeout = Number(message.options?.timeout) || 15000;
        let timer;
        try {
          const position = await Promise.race([
            Location.getCurrentPositionAsync(options),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(Object.assign(new Error('Finding your location timed out.'), { code: 'E_LOCATION_TIMEOUT' })), timeout);
            }),
          ]);
          sendLocationResult(message.id, {
            position: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude,
              altitudeAccuracy: position.coords.altitudeAccuracy,
              heading: position.coords.heading,
              speed: position.coords.speed,
              timestamp: position.timestamp,
            },
          });
        } finally {
          clearTimeout(timer);
        }
        return;
      }

      const subscription = await Location.watchPositionAsync(
        { ...options, timeInterval: 1000, distanceInterval: 0 },
        (position) => sendLocationResult(message.id, {
          position: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          },
        })
      );
      if (watch.cancelled) subscription.remove();
      else watch.subscription = subscription;
    } catch (error) {
      sendLocationResult(message.id, { error: { code: errorCode(error), message: error.message } });
      const watch = watches.current.get(message.id);
      watch?.subscription?.remove();
      watches.current.delete(message.id);
    }
  };

  useEffect(() => () => {
    watches.current.forEach((watch) => watch.subscription?.remove());
    watches.current.clear();
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      {!appUrl || failed ? (
        <ConnectionHelp
          missingServer={!appUrl}
          onRetry={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        />
      ) : (
        <WebView
          key={attempt}
          ref={webView}
          source={{ uri: appUrl }}
          originWhitelist={['http://*', 'https://*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          geolocationEnabled
          injectedJavaScriptBeforeContentLoaded={locationBridge}
          onMessage={handleLocationMessage}
          allowsBackForwardNavigationGestures
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#1f7a45" />
              <Text style={styles.message}>Connecting to AgriConnect...</Text>
            </View>
          )}
          onError={() => setFailed(true)}
          renderError={() => <ConnectionHelp onRetry={() => setAttempt((value) => value + 1)} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#fff' },
  help: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#fff' },
  title: { color: '#193b29', fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  message: { color: '#49564e', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  button: { backgroundColor: '#1f7a45', borderRadius: 8, marginTop: 20, paddingHorizontal: 22, paddingVertical: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
