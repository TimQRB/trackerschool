import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../../context/LiveContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

interface SettingRowProps {
  label: string;
  value: string;
  onPress?: () => void;
}

function SettingRow({ label, value, onPress }: SettingRowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{value}</Text>
        {onPress && <Text style={styles.rowArrow}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { students } = useLive();
  const device = students[0]?.student?.device;
  const studentId = students[0]?.student?.id;
  const canManage = user?.role === 'school' || user?.role === 'admin';

  const [sending, setSending] = useState<string | null>(null);
  const [gpsInterval, setGpsInterval] = useState('60');
  const [hrInterval, setHrInterval] = useState('60');
  const [smsMode, setSmsMode] = useState('1');

  const sendCommand = async (command: string, payload: any) => {
    if (!studentId) return;
    setSending(command);
    try {
      const res = await api.post('/api/commands/batch', {
        student_ids: [studentId],
        command,
        payload,
      });
      const results = res.data.results || [];
      const sent = results.filter((r: any) => r.sent).length;
      Alert.alert('Готово', `Команда отправлена на ${sent} устройств(а)`);
    } catch (e: any) {
      Alert.alert('Ошибка', e.response?.data?.detail || e.message);
    } finally {
      setSending(null);
    }
  };

  const toggleLessonMode = (enable: boolean) => {
    sendCommand('lesson_mode', {
      swit: enable ? 3 : 0,
      list: [
        {
          week: '1,2,3,4,5',
          timeList: [{ begTime: '0800', endTime: '1600' }],
        },
      ],
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Настройки</Text>
        {students[0] && <Text style={styles.subtitle}>{students[0].student.full_name}</Text>}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {canManage ? (
          <>
            <View style={styles.sectionTitleRow}>
              <Feather name="book-open" size={16} color="#0f172a" />
              <Text style={styles.sectionTitle}> Режим урока</Text>
            </View>
            <View style={styles.card}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.greenBtn]}
                onPress={() => toggleLessonMode(true)}
                disabled={sending !== null}
              >
                {sending === 'lesson_mode' ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.actionBtnText}>Включить режим урока</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.grayBtn]}
                onPress={() => toggleLessonMode(false)}
                disabled={sending !== null}
              >
                <Text style={styles.actionBtnText}>Выключить</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                Расписание: Пн-Пт 08:00-16:00 (SOS-звонки разрешены)
              </Text>
            </View>

            <View style={styles.sectionTitleRow}>
              <Feather name="wifi" size={16} color="#0f172a" />
              <Text style={styles.sectionTitle}> Интервал GPS</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={gpsInterval}
                  onChangeText={setGpsInterval}
                  keyboardType="number-pad"
                  placeholder="60"
                />
                <Text style={styles.inputLabel}>секунд</Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.blueBtn]}
                onPress={() => sendCommand('set_gps_interval', { posPeriod: gpsInterval })}
                disabled={sending !== null}
              >
                {sending === 'set_gps_interval' ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.actionBtnText}>Установить</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.sectionTitleRow}>
              <Feather name="heart" size={16} color="#0f172a" />
              <Text style={styles.sectionTitle}> Интервал пульса</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={hrInterval}
                  onChangeText={setHrInterval}
                  keyboardType="number-pad"
                  placeholder="60"
                />
                <Text style={styles.inputLabel}>минут</Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.blueBtn]}
                onPress={() => sendCommand('set_heart_rate_interval', { heartRatePeriod: hrInterval })}
                disabled={sending !== null}
              >
                {sending === 'set_heart_rate_interval' ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.actionBtnText}>Установить</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.sectionTitleRow}>
              <Feather name="bell-off" size={16} color="#0f172a" />
              <Text style={styles.sectionTitle}> Блокировка SMS</Text>
            </View>
            <View style={styles.card}>
              {['1', '2', '3'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.radioRow, smsMode === mode && styles.radioActive]}
                  onPress={() => setSmsMode(mode)}
                >
                  <View style={[styles.radio, smsMode === mode && styles.radioChecked]}>
                    {smsMode === mode && <View style={styles.radioInner} />}
                  </View>
                  <Text style={styles.radioLabel}>
                    {mode === '1' ? 'Без блокировки' : mode === '2' ? 'Только семья + белый список' : 'Блокировать все'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.actionBtn, styles.blueBtn, { marginTop: 8 }]}
                onPress={() => sendCommand('set_sms_block', { interceptorMode: smsMode })}
                disabled={sending !== null}
              >
                {sending === 'set_sms_block' ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.actionBtnText}>Применить</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.restrictedBanner}>
            <Feather name="lock" size={32} color="#92400e" />
            <Text style={styles.restrictedText}>
              Управление устройством доступно только сотрудникам школы
            </Text>
          </View>
        )}

        <View style={styles.sectionTitleRow}>
          <Feather name="smartphone" size={16} color="#0f172a" />
          <Text style={styles.sectionTitle}> Информация об устройстве</Text>
        </View>
        <View style={styles.card}>
          {device ? (
            <>
              <SettingRow label="Модель" value={device.model_name || '—'} />
              <SettingRow label="Тип" value={device.dev_type || '—'} />
              <SettingRow label="ID" value={device.identifier} />
              <SettingRow label="IMEI" value={device.imei || '—'} />
              <SettingRow label="Статус" value={device.is_active ? 'Активно' : 'Отключено'} />
              <SettingRow
                label="Последний раз на связи"
                value={device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : '—'}
              />
            </>
          ) : (
            <Text style={styles.emptyText}>Нет устройства</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topbar: { paddingHorizontal: 16,  paddingBottom: 12, backgroundColor: '#1e3a8a' },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#93c5fd', fontSize: 13, marginTop: 2 },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowLabel: { fontSize: 14, color: '#475569' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { fontSize: 14, color: '#0f172a', fontWeight: '500' },
  rowArrow: { fontSize: 18, color: '#94a3b8' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: '#0f172a',
  },
  inputLabel: { fontSize: 14, color: '#64748b' },
  actionBtn: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginVertical: 4,
  },
  greenBtn: { backgroundColor: '#22c55e' },
  grayBtn: { backgroundColor: '#64748b' },
  blueBtn: { backgroundColor: '#1e3a8a' },
  actionBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  radioActive: { backgroundColor: '#eff6ff' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  radioChecked: { borderColor: '#1e3a8a' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1e3a8a' },
  radioLabel: { fontSize: 14, color: '#0f172a', flex: 1 },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  restrictedBanner: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#fde68a',
    alignItems: 'center',
    marginTop: 16,
  },
  restrictedText: { fontSize: 14, color: '#92400e', textAlign: 'center', lineHeight: 20, marginTop: 8 },
});
