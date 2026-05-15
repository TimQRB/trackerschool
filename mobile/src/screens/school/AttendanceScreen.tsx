import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { getClassAttendance, AttendanceRecord } from '../../api/attendance';

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  present: { label: 'Здесь', color: '#22c55e', icon: 'check-circle' },
  absent: { label: 'Отсутствует', color: '#ef4444', icon: 'x-circle' },
  late: { label: 'Опоздал', color: '#f59e0b', icon: 'clock' },
  unknown: { label: '—', color: '#94a3b8', icon: 'minus' },
};

export default function AttendanceScreen() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getClassAttendance();
      setRecords(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const present = records.filter((r) => r.status === 'present');
  const absent = records.filter((r) => r.status === 'absent' || r.status === 'unknown');
  const late = records.filter((r) => r.status === 'late');

  const today = new Date().toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#1e3a8a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Посещаемость</Text>
        <Text style={styles.subtitle}>{today}</Text>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#22c55e' }]}>{present.length}</Text>
          <Text style={styles.summaryLabel}>Здесь</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>{late.length}</Text>
          <Text style={styles.summaryLabel}>Опоздали</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#ef4444' }]}>{absent.length}</Text>
          <Text style={styles.summaryLabel}>Нет</Text>
        </View>
      </View>

      <FlatList
        data={records}
        keyExtractor={(item) => String(item.student_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const info = STATUS_LABELS[item.status] || STATUS_LABELS.unknown;
          return (
            <View style={[styles.card, { borderLeftColor: info.color }]}>
              <View style={styles.cardRow}>
                <Text style={styles.cardName}>{item.full_name}</Text>
                <View style={styles.cardStatusRow}>
                  <Feather name={info.icon as any} size={14} color={info.color} />
                  <Text style={[styles.cardStatus, { color: info.color }]}>{info.label}</Text>
                </View>
              </View>
              <View style={styles.cardMeta}>
                {item.enter_time && (
                  <Text style={styles.cardTime}>
                    Пришёл: {new Date(item.enter_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
                {item.exit_time && (
                  <Text style={styles.cardTime}>
                    Ушёл: {new Date(item.exit_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  topbar: { paddingHorizontal: 16,  paddingBottom: 12, backgroundColor: '#1e3a8a' },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#93c5fd', fontSize: 13, marginTop: 2 },
  summary: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryValue: { fontSize: 28, fontWeight: '700' },
  summaryLabel: { fontSize: 12, color: '#64748b', marginTop: 2 },
  list: { padding: 16, paddingTop: 0 },
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardStatus: { fontSize: 13, fontWeight: '500' },
  cardMeta: { marginTop: 4 },
  cardTime: { fontSize: 12, color: '#64748b' },
});
