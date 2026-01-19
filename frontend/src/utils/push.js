import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { fetchWebPushPublicKey } from '../api/client';

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return registerForWebPushNotificationsAsync();
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

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  return tokenResponse?.data ? { type: 'expo', token: tokenResponse.data } : null;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerForWebPushNotificationsAsync() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications.');
    return null;
  }
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers are not supported in this browser.');
    return null;
  }
  if (!('PushManager' in window)) {
    console.warn('Push messaging is not supported in this browser.');
    return null;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    console.warn('Web push notification permission was not granted.');
    return null;
  }

  const registration = await navigator.serviceWorker.register('/web-push-sw.js');
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    let publicKey;
    try {
      const response = await fetchWebPushPublicKey();
      publicKey = response?.public_key;
    } catch (error) {
      console.warn('Unable to fetch Web Push public key.', error);
      return null;
    }
    if (!publicKey) {
      console.warn('Missing Web Push public key.');
      return null;
    }
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  return { type: 'web', subscription: subscription.toJSON() };
}
