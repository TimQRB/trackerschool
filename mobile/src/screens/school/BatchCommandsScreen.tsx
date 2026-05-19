import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../context/LiveContext';
import { batchCommand } from '../../api/commands';

export default function BatchCommandsScreen() {
  const { students } = useLive();
  const [sending, setSending] = useState<string | null>(null);

  const insets = useSafeAreaInsets();
  const allIds = students.map((s) => s.student.id);

  const send = async (command: string, payload?: any) => {
    if (allIds.length === 0) {
      Alert.alert('Ошибка', 'Нет учеников');
      return;
    }
    setSending(command);
    try {
      const res = await batchCommand(allIds, command, payload || {});
      const sent = res.results.filter((r) => r.sent).length;
      if (sent === 0) {
        Alert.alert('Ошибка', 'Устройства не на связи. Команда не доставлена.');
      } else {
        Alert.alert('Готово', `Команда отправлена на ${sent} из ${res.results.length} устройств`);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e.response?.data?.detail || e.message);
    } finally {
      setSending(null);
    }
  };

  const commands = [
    {
      key: 'lesson_mode_on',
      icon: 'book-open' as const,
      label: 'Включить режим урока',
      desc: 'Запрет исходящих звонков, SOS разрешён',
      color: '#22c55e',
      action: () =>
        send('lesson_mode', {
          swit: 3,
          list: [
            {
              week: '1,2,3,4,5',
              timeList: [{ begTime: '0800', endTime: '1600' }],
            },
          ],
        }),
    },
    {
      key: 'lesson_mode_off',
      icon: 'book-open' as const,
      label: 'Выключить режим урока',
      desc: 'Восстановить звонки',
      color: '#64748b',
      action: () => send('lesson_mode', { swit: 0, list: [] }),
    },
    {
      key: 'locate_all',
      icon: 'map-pin' as const,
      label: 'Найти всех сейчас',
      desc: 'Запросить немедленную геолокацию у всех',
      color: '#1e3a8a',
      action: () => send('locate_now'),
    },
    {
      key: 'set_gps_1',
      icon: 'wifi' as const,
      label: 'GPS интервал: 1 мин',
      desc: 'Частое позиционирование (расход батареи)',
      color: '#1e3a8a',
      // HC02 posPeriod = минуты (spec 4.14, диапазон 1-60)
      action: () => send('set_gps_interval', { posPeriod: '1' }),
    },
    {
      key: 'set_gps_5',
      icon: 'wifi' as const,
      label: 'GPS интервал: 5 мин',
      desc: 'Стандартный режим',
      color: '#1e3a8a',
      action: () => send('set_gps_interval', { posPeriod: '5' }),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Команды классу</Text>
        <Text style={styles.subtitle}>{students.length} учеников</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {commands.map((cmd) => (
          <TouchableOpacity
            key={cmd.key}
            style={[styles.cmdCard, { borderLeftColor: cmd.color }]}
            onPress={cmd.action}
            disabled={sending !== null}
          >
            <View style={styles.cmdRow}>
              <View style={styles.cmdInfo}>
                <View style={styles.cmdLabelRow}>
                  <Feather name={cmd.icon} size={18} color={cmd.color} />
                  <Text style={styles.cmdLabel}>{cmd.label}</Text>
                </View>
                <Text style={styles.cmdDesc}>{cmd.desc}</Text>
              </View>
              {sending === cmd.key ? (
                <ActivityIndicator color={cmd.color} />
              ) : (
                <Text style={[styles.cmdArrow, { color: cmd.color }]}>›</Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topbar: { paddingHorizontal: 16,  paddingBottom: 12, backgroundColor: '#1e3a8a' },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#93c5fd', fontSize: 13, marginTop: 2 },
  content: { padding: 16 },
  cmdCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cmdRow: { flexDirection: 'row', alignItems: 'center' },
  cmdInfo: { flex: 1 },
  cmdLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cmdLabel: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  cmdDesc: { fontSize: 13, color: '#64748b', marginTop: 2 },
  cmdArrow: { fontSize: 24, fontWeight: '300', marginLeft: 8 },
});
