import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../context/LiveContext';
import { getHealth, HealthRecord } from '../../api/health';

export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const { students } = useLive();
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const studentId = students[0]?.student?.id;

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }
    getHealth(studentId)
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  const latest = records.length > 0 ? records[records.length - 1] : null;
  const totalSteps = latest?.steps ?? records.reduce((max, r) => Math.max(max, r.steps ?? 0), 0);
  const avgHeartRate = records.length > 0
    ? Math.round(records.reduce((s, r) => s + (r.heart_rate ?? 0), 0) / records.filter((r) => r.heart_rate).length)
    : null;
  const latestSpo2 = latest?.spo2 ?? null;

  const stepsPercent = totalSteps > 0 ? Math.min(totalSteps / 10000, 1) : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Здоровье</Text>
        {students[0] && <Text style={styles.subtitle}>{students[0].student.full_name}</Text>}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#1e3a8a" /></View>
      ) : !studentId ? (
        <View style={styles.centered}><Text style={styles.emptyText}>Нет учеников</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Feather name="activity" size={16} color="#64748b" />
              <Text style={styles.cardTitle}> Шаги</Text>
            </View>
            <Text style={styles.cardValue}>{totalSteps.toLocaleString()}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${stepsPercent * 100}%` }]} />
            </View>
            <Text style={styles.cardSub}>из 10 000</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Feather name="heart" size={16} color="#64748b" />
              <Text style={styles.cardTitle}> Пульс</Text>
            </View>
            <Text style={styles.cardValue}>
              {avgHeartRate ? `${avgHeartRate} уд/мин` : '—'}
            </Text>
            <Text style={styles.cardSub}>
              {records.length > 0
                ? `Замеров за сегодня: ${records.length}`
                : 'Нет данных'}
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Feather name="droplet" size={16} color="#64748b" />
              <Text style={styles.cardTitle}> SpO₂ (кислород крови)</Text>
            </View>
            <Text style={styles.cardValue}>
              {latestSpo2 ? `${latestSpo2}%` : '—'}
            </Text>
            <Text style={styles.cardSub}>Норма: 95-100%</Text>
          </View>

          <Text style={styles.note}>
            Данные обновляются когда браслет отправляет показания.
            Пульс — раз в 60 мин, SpO₂ — по запросу пользователя.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topbar: { paddingHorizontal: 16,  paddingBottom: 12, backgroundColor: '#1e3a8a' },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#93c5fd', fontSize: 13, marginTop: 2 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  content: { padding: 16 },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  cardValue: { fontSize: 28, fontWeight: '700', color: '#0f172a', marginTop: 4 },
  cardSub: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
  progressBar: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 4,
  },
  note: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
