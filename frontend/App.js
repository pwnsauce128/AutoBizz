import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import AuctionDetailScreen from './src/screens/AuctionDetailScreen';
import AuctionListScreen from './src/screens/AuctionListScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <Stack.Navigator key={isAuthenticated ? 'app' : 'auth'}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Auctions" component={AuctionListScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="AuctionDetail"
            component={AuctionDetailScreen}
            options={{ title: 'Auction detail' }}
          />
        </>
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
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
