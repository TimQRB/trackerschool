import { useRef, useEffect } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { LiveProvider, useLive } from './src/context/LiveContext';
import { useAuth } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { registerForPushNotifications, setupNotificationListener } from './src/utils/notifications';

function AppInner() {
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const { events } = useLive();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      registerForPushNotifications();
    }
  }, [user]);

  useEffect(() => {
    const sub = setupNotificationListener((data) => {
      if (data.type === 'sos' && data.student_id) {
        const existing = events.find(
          (e) => e.event_type === 'sos' && String(e.student_id) === data.student_id,
        );
        if (existing && navigationRef.current) {
          navigationRef.current.navigate('SOSAlert', { event: existing });
        }
      }
    });
    return () => sub.remove();
  }, [events]);

  useEffect(() => {
    if (!events.length) return;
    const latest = events[0];
    if (latest.event_type === 'sos' && navigationRef.current) {
      navigationRef.current.navigate('SOSAlert', { event: latest });
    }
  }, [events.length > 0 ? events[0].id : null]);

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <ErrorBoundary>
          <RootNavigator />
        </ErrorBoundary>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LiveProvider>
        <AppInner />
      </LiveProvider>
    </AuthProvider>
  );
}
