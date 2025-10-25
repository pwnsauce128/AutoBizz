import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import AuctionManagementList from '../components/AuctionManagementList';
import UserManagementSection from '../components/UserManagementSection';

export default function AdminHomeScreen() {
  const { logout, accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  useFocusEffect(
    useCallback(() => {
      setActiveTab('users');
      setRefreshKey((current) => current + 1);
    }, []),
  );

  const showUsers = activeTab === 'users';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Admin control center</Text>
          <Text style={styles.subtitle}>Manage platform users and oversee auctions</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab('users')}
          style={[styles.tabButton, showUsers && styles.tabButtonActive]}
        >
          <Text style={[styles.tabLabel, showUsers && styles.tabLabelActive]}>Users</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('auctions')}
          style={[styles.tabButton, !showUsers && styles.tabButtonActive]}
        >
          <Text style={[styles.tabLabel, !showUsers && styles.tabLabelActive]}>Auctions</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {showUsers ? (
          <UserManagementSection accessToken={accessToken} />
        ) : (
          <KeyboardAvoidingView
            style={styles.keyboardAvoider}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
          >
            <AuctionManagementList
              mode="admin"
              accessToken={accessToken}
              refreshKey={refreshKey}
              style={styles.auctionsList}
            />
          </KeyboardAvoidingView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f4f8',
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    color: '#4a4a4a',
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ffe5e5',
  },
  logout: {
    color: '#d92d20',
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#e0e5f2',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  tabLabel: {
    fontWeight: '500',
    color: '#3d3d3d',
  },
  tabLabelActive: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    marginTop: 16,
  },
  keyboardAvoider: {
    flex: 1,
  },
  auctionsList: {
    paddingBottom: 32,
  },
});
