import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import AdminNewAuctionForm from '../components/AdminNewAuctionForm';
import AuctionListScreen from './AuctionListScreen';

export default function AdminHomeScreen({ navigation }) {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('admin');
  const [refreshKey, setRefreshKey] = useState(0);

  const goToAdmin = useCallback(() => setActiveTab('admin'), []);
  const goToAuctions = useCallback(() => setActiveTab('auctions'), []);

  useFocusEffect(
    useCallback(() => {
      setActiveTab('admin');
    }, []),
  );

  const handleCreated = () => {
    setRefreshKey((current) => current + 1);
    setActiveTab('auctions');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Admin workspace</Text>
          <Text style={styles.subtitle}>Register new auctions or browse live listings</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        <Pressable
          onPress={goToAdmin}
          style={[styles.tabButton, activeTab === 'admin' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabLabel, activeTab === 'admin' && styles.tabLabelActive]}>Admin view</Text>
        </Pressable>
        <Pressable
          onPress={goToAuctions}
          style={[styles.tabButton, activeTab === 'auctions' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabLabel, activeTab === 'auctions' && styles.tabLabelActive]}>Auction view</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {activeTab === 'admin' ? (
          <AdminNewAuctionForm onCreated={handleCreated} />
        ) : (
          <AuctionListScreen key={`admin-auctions-${refreshKey}`} navigation={navigation} />
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
});
