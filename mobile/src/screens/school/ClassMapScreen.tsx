import { useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../context/LiveContext';

const INITIAL_REGION: Region = {
  latitude: 43.238,
  longitude: 76.9,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function ClassMapScreen() {
  const mapRef = useRef<MapView>(null);
  const { students, connected } = useLive();

  const online = useMemo(
    () => students.filter((s) => {
      if (!s.location) return false;
      const elapsed = Date.now() - new Date(s.location.recorded_at).getTime();
      return elapsed < 5 * 60 * 1000;
    }),
    [students],
  );

  const offline = useMemo(
    () => students.filter((s) => {
      if (!s.location) return true;
      const elapsed = Date.now() - new Date(s.location.recorded_at).getTime();
      return elapsed >= 5 * 60 * 1000;
    }),
    [students],
  );

  const insets = useSafeAreaInsets();
  const noLocation = useMemo(
    () => students.filter((s) => !s.location),
    [students],
  );

  if (students.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.topbar}>
          <Text style={styles.title}>Карта класса</Text>
          <View style={styles.stats}>
            <Text style={styles.statText}>Нет учеников</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Feather name="map-pin" size={48} color="#94a3b8" />
          <Text style={styles.emptyText}>Нет данных об учениках</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Карта класса</Text>
        <View style={styles.stats}>
          <View style={[styles.statDot, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.statText}>{online.length} онлайн</Text>
          <View style={[styles.statDot, { backgroundColor: '#94a3b8' }]} />
          <Text style={styles.statText}>{offline.length + noLocation.length} офлайн</Text>
        </View>
      </View>

      <MapView ref={mapRef} style={styles.map} initialRegion={INITIAL_REGION} showsCompass mapPadding={{ top: 50, right: 16, bottom: 0, left: 16 }}>
        {students.map(({ student, location }) => {
          if (!location) return null;
          const isOnline =
            Date.now() - new Date(location.recorded_at).getTime() < 5 * 60 * 1000;
          return (
            <Marker
              key={student.id}
              coordinate={{ latitude: location.lat, longitude: location.lon }}
              pinColor={isOnline ? '#22c55e' : '#94a3b8'}
              title={student.full_name}
              description={`Класс ${student.class_name} • Заряд: ${location.battery ?? '—'}%`}
            />
          );
        })}
      </MapView>

      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Ученики ({students.length})</Text>
        {students.slice(0, 20).map(({ student, location }) => {
          const isOnline = location
            ? Date.now() - new Date(location.recorded_at).getTime() < 5 * 60 * 1000
            : false;
          return (
            <View key={student.id} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: isOnline ? '#22c55e' : '#94a3b8' }]} />
              <Text style={styles.legendName}>{student.full_name}</Text>
              <Text style={styles.legendClass}>{student.class_name}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topbar: {
    paddingHorizontal: 16,
    
    paddingBottom: 12,
    backgroundColor: '#1e3a8a',
  },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statText: { color: '#93c5fd', fontSize: 13 },
  map: { flex: 1 },
  legend: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    maxHeight: 250,
  },
  legendTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  legendName: { fontSize: 13, color: '#0f172a', flex: 1 },
  legendClass: { fontSize: 12, color: '#94a3b8' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
});
