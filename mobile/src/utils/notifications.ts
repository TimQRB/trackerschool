import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission denied');
    return null;
  }

  // In Expo Go this returns an Expo push token (ExponentPushToken[...]).
  // For production FCM, build a standalone APK with google-services.json.
  // Then getExpoPushTokenAsync will return a native FCM token.
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    await api.post('/api/notifications/register-fcm', {
      fcm_token: token,
      platform: Platform.OS,
    });

    return token;
  } catch (e) {
    console.warn('Failed to get push token:', e);
    return null;
  }
}

export function setupNotificationListener(
  onNotification: (data: Record<string, any>) => void,
) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data || {};
    onNotification(data);
  });

  return sub;
}
