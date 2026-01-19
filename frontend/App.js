import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { ImageBackground, StyleSheet } from 'react-native';
import AuctionDetailScreen from './src/screens/AuctionDetailScreen';
import AuctionListScreen from './src/screens/AuctionListScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import AdminHomeScreen from './src/screens/AdminHomeScreen';
import SellerHomeScreen from './src/screens/SellerHomeScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { navigationRef, resetToLogin } from './src/navigation/navigationRef';
import { BASE_URL, registerDevice, registerWebPushSubscription } from './src/api/client';
import { registerForPushNotificationsAsync } from './src/utils/push';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { isAuthenticated, role } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      resetToLogin();
    }
  }, [isAuthenticated]);

  return (
    <Stack.Navigator key={isAuthenticated ? 'app' : 'auth'}>
      {isAuthenticated ? (
        role === 'admin' ? (
          <>
            <Stack.Screen name="Admin" component={AdminHomeScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="AuctionDetail"
              component={AuctionDetailScreen}
              options={{ title: 'Auction detail' }}
            />
          </>
        ) : role === 'seller' ? (
          <>
            <Stack.Screen name="Seller" component={SellerHomeScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="AuctionDetail"
              component={AuctionDetailScreen}
              options={{ title: 'Auction detail' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Auctions" component={AuctionListScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="AuctionDetail"
              component={AuctionDetailScreen}
              options={{ title: 'Auction detail' }}
            />
          </>
        )
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

function PushRegistrationManager() {
  const { isAuthenticated, accessToken } = useAuth();
  const lastRegisteredToken = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    if (!isAuthenticated || !accessToken) {
      lastRegisteredToken.current = null;
      return undefined;
    }

    async function registerAsync() {
      try {
        const pushInfo = await registerForPushNotificationsAsync();
        if (!pushInfo || isCancelled) {
          return;
        }
        if (pushInfo.type === 'expo') {
          if (lastRegisteredToken.current === pushInfo.token) {
            return;
          }
          await registerDevice(pushInfo.token, accessToken);
          if (!isCancelled) {
            lastRegisteredToken.current = pushInfo.token;
          }
        } else if (pushInfo.type === 'web') {
          const endpoint = pushInfo.subscription?.endpoint;
          if (endpoint && lastRegisteredToken.current === endpoint) {
            return;
          }
          await registerWebPushSubscription(pushInfo.subscription, accessToken);
          if (!isCancelled) {
            lastRegisteredToken.current = endpoint ?? null;
          }
        }
      } catch (error) {
        console.warn('Failed to register push notifications', error);
      }
    }

    registerAsync();

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, accessToken]);

  return null;
}

export default function App() {
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'transparent',
    },
  };

  useEffect(() => {
    console.log('EXPO_PUBLIC_API_URL (process):', process.env.EXPO_PUBLIC_API_URL);
    console.log('EXPO config extra apiUrl:', Constants.expoConfig?.extra?.apiUrl);
    console.log('Resolved BASE_URL:', BASE_URL);
  }, []);

  return (
    <ImageBackground source={require('./src/bg.jpeg')} style={styles.background} resizeMode="cover">
      <AuthProvider>
        <PushRegistrationManager />
        <NavigationContainer ref={navigationRef} theme={navigationTheme} style={styles.container}>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
