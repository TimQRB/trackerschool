import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  AppState,
  Platform,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../context/LiveContext';
import { useAuth } from '../../context/AuthContext';

export default function SOSAlertScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { events } = useLive();
  const { logout } = useAuth();
  const latestSos = route.params?.event || events.find((e) => e.event_type === 'sos');

  if (!latestSos) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.sosTitle}>Нет активных SOS</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.actionText}>Закрыть</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const region: Region = {
    latitude: latestSos.lat ? Number(latestSos.lat) : 43.238,
    longitude: latestSos.lon ? Number(latestSos.lon) : 76.9,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const handleCall = () => {
    const phone = ';'; // User's phone number — would need to get from contacts
    Linking.openURL('tel:');
  };

  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.banner, { paddingTop: insets.top + 10 }]}>
        <Feather name="alert-octagon" size={48} color="white" />
        <Text style={styles.sosTitle}>SOS! Тревога</Text>
      </View>

      <MapView style={styles.map} initialRegion={region} scrollEnabled={false}>
        {latestSos.lat && latestSos.lon && (
          <Marker
            coordinate={{
              latitude: Number(latestSos.lat),
              longitude: Number(latestSos.lon),
            }}
            pinColor="#dc2626"
          />
        )}
      </MapView>

      <View style={styles.info}>
        <Text style={styles.message}>{latestSos.message}</Text>
        {latestSos.lat && latestSos.lon && (
          <Text style={styles.coords}>
            {Number(latestSos.lat).toFixed(5)}, {Number(latestSos.lon).toFixed(5)}
          </Text>
        )}
        <Text style={styles.time}>
          {new Date(latestSos.created_at).toLocaleString()}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.callBtn} onPress={handleCall}>
            <Feather name="phone" size={18} color="white" />
            <Text style={styles.actionText}> Позвонить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Feather name="x" size={18} color="white" />
            <Text style={styles.actionText}> Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#7f1d1d' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  banner: {
    alignItems: 'center',
    
    paddingBottom: 16,
    backgroundColor: '#991b1b',
  },
  sosTitle: { color: 'white', fontSize: 22, fontWeight: '700', marginTop: 4 },
  map: { flex: 1, margin: 16, borderRadius: 12, overflow: 'hidden' },
  info: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  message: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  coords: { fontSize: 14, color: '#64748b', marginTop: 4 },
  time: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  callBtn: {
    flex: 1,
    backgroundColor: '#22c55e',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  closeBtn: {
    flex: 1,
    backgroundColor: '#64748b',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  actionText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
