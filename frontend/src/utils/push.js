import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    console.warn('Push notifications are not supported on this device.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const permissionResponse = await Notifications.requestPermissionsAsync();
    finalStatus = permissionResponse.status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Notification permissions were not granted.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    Constants.manifest?.extra?.eas?.projectId;

  if (!projectId) {
    console.warn(
      "Expo push notifications require an EAS project ID. Set the 'EXPO_PUBLIC_EAS_PROJECT_ID' environment variable (or 'EAS_PROJECT_ID' / 'EXPO_PROJECT_ID') so it can be injected via the Expo config.",
    );
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });

  return tokenResponse?.data ?? null;
}
