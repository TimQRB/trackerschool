import { useRef, useCallback, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../context/LiveContext';
import { api } from '../../api/client';
import StudentMarker from '../../components/StudentMarker';
import GeofencePolygon from '../../components/GeofencePolygon';
import RoutePolyline from '../../components/RoutePolyline';

const INITIAL_REGION: Region = {
  latitude: 43.238,
  longitude: 76.9,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { students, geofences, selectedStudentId, setSelectedStudentId } = useLive();
  const [locating, setLocating] = useState<number | null>(null);

  const selectedStudent = students.find((s) => s.student.id === selectedStudentId);

  const centerOnStudent = useCallback(() => {
    const s = selectedStudent || students[0];
    if (s?.location) {
      mapRef.current?.animateToRegion(
        {
          latitude: s.location.lat,
          longitude: s.location.lon,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        800,
      );
    }
  }, [selectedStudent, students]);

  const handleLocateNow = async () => {
    const s = selectedStudent || students[0];
    if (!s?.student.device) return;
    setLocating(s.student.id);
    try {
      const res = await api.post(`/api/devices/${s.student.device.id}/locate-now`);
      if (!res.data.ok) {
        alert(res.data.reason || 'Устройство не на связи');
      }
    } catch (e: any) {
      alert('Ошибка: ' + (e.message || 'неизвестная'));
    } finally {
      setLocating(null);
    }
  };

  useEffect(() => {
    if (selectedStudent?.location && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: selectedStudent.location.lat,
          longitude: selectedStudent.location.lon,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        800,
      );
    }
  }, [selectedStudent?.location?.lat, selectedStudent?.location?.lon]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        showsUserLocation={false}
        showsCompass
        mapPadding={{ top: 50, right: 16, bottom: 0, left: 16 }}
      >
        {geofences.map((g) => (
          <GeofencePolygon key={g.id} geofence={g} />
        ))}

        {students.map(({ student, location, track }) => (
          <View key={student.id}>
            {track.length > 1 && (
              <RoutePolyline
                track={track}
                isSelected={selectedStudentId === student.id}
              />
            )}
            {location && (
              <StudentMarker
                student={student}
                point={location}
                isSelected={selectedStudentId === student.id}
                onPress={() => setSelectedStudentId(student.id)}
              />
            )}
          </View>
        ))}
      </MapView>

      <View style={[styles.bottomCard, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        {selectedStudent ? (
          <>
            <Text style={styles.name}>{selectedStudent.student.full_name}</Text>
            <Text style={styles.meta}>
              Класс {selectedStudent.student.class_name}
              {selectedStudent.location
                ? ` • Заряд: ${selectedStudent.location.battery ?? '—'}%`
                : ''}
            </Text>
            <Text style={styles.meta}>
              {selectedStudent.location
                ? `Обновлено: ${new Date(selectedStudent.location.recorded_at).toLocaleTimeString()}`
                : 'Нет данных о местоположении'}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.btn} onPress={centerOnStudent}>
                <Feather name="map-pin" size={14} color="white" />
                <Text style={styles.btnText}> Центрировать</Text>
              </TouchableOpacity>
              {selectedStudent.student.device && (
                <TouchableOpacity
                  style={[styles.btn, locating ? styles.btnDisabled : null]}
                  onPress={handleLocateNow}
                  disabled={locating !== null}
                >
                  {locating === selectedStudent.student.id ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Feather name="wifi" size={14} color="white" />
                      <Text style={styles.btnText}> Найти сейчас</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.empty}>Нет учеников</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  bottomCard: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  name: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    backgroundColor: '#1e3a8a',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'white', fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', padding: 20 },
});
