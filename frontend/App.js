import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ImageBackground, StyleSheet } from 'react-native';
import AuctionDetailScreen from './src/screens/AuctionDetailScreen';
import AuctionListScreen from './src/screens/AuctionListScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import AdminHomeScreen from './src/screens/AdminHomeScreen';
import SellerHomeScreen from './src/screens/SellerHomeScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { navigationRef, resetToLogin } from './src/navigation/navigationRef';

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

export default function App() {
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'transparent',
    },
  };

  return (
    <ImageBackground source={require('./src/bg.jpeg')} style={styles.background} resizeMode="cover">
      <AuthProvider>
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
