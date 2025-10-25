import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listAuctions } from '../api/client';
import LoadingOverlay from '../components/LoadingOverlay';
import { useAuth } from '../context/AuthContext';
import useLogoutHandler from '../hooks/useLogoutHandler';

function AuctionCard({ auction, onPress, highlight }) {
  const previewImage =
    (Array.isArray(auction.image_urls) && auction.image_urls[0]) ||
    (Array.isArray(auction.images) && auction.images[0]) ||
    null;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        highlight === 'won' && styles.cardHighlightWon,
        highlight === 'lost' && styles.cardHighlightLost,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      {previewImage ? (
        <Image source={{ uri: previewImage }} style={styles.cardImage} resizeMode="cover" />
      ) : null}
      <Text style={styles.cardTitle}>{auction.title}</Text>
      {auction.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {auction.description}
        </Text>
      ) : null}
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Minimum:</Text>
        <Text style={styles.cardValue}>
          {auction.min_price} {auction.currency}
        </Text>
      </View>
      {auction.end_at ? (
        <Text style={styles.cardMeta}>Ends at {new Date(auction.end_at).toLocaleString()}</Text>
      ) : null}
    </Pressable>
  );
}

function isAuctionExpired(auction) {
  if (!auction) {
    return false;
  }

  if (auction.status && auction.status !== 'active') {
    return true;
  }

  if (auction.end_at) {
    const endAt = new Date(auction.end_at).getTime();
    if (!Number.isNaN(endAt) && endAt <= Date.now()) {
      return true;
    }
  }

  return false;
}

const TABS = [
  { key: 'all', label: 'All auctions', status: 'active' },
  { key: 'participating', label: 'My bids', status: 'all', scope: 'participating' },
];

export default function AuctionListScreen({ navigation }) {
  const { logout, accessToken, userId } = useAuth();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTabKey, setActiveTabKey] = useState('all');

  const handleLogout = useLogoutHandler(logout);

  const currentTab = useMemo(
    () => TABS.find((tab) => tab.key === activeTabKey) || TABS[0],
    [activeTabKey],
  );

  const loadAuctions = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setLoading(true);
      }
      try {
        setError(null);
        const params = { status: currentTab.status };
        if (currentTab.scope) {
          if (!accessToken) {
            throw new Error('Log in to view auctions you have bid on.');
          }
          params.scope = currentTab.scope;
          params.token = accessToken;
        }
        const data = await listAuctions(params);
        const processed =
          currentTab.key === 'all' ? data.filter((auction) => !isAuctionExpired(auction)) : data;
        setAuctions(processed);
      } catch (err) {
        setError(err.message);
        setAuctions([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, currentTab],
  );

  useEffect(() => {
    loadAuctions(true);
  }, [loadAuctions]);

  useFocusEffect(
    useCallback(() => {
      loadAuctions();
    }, [loadAuctions]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadAuctions();
  };

  if (loading) {
    return <LoadingOverlay />;
  }

  const emptyMessage =
    currentTab.key === 'participating'
      ? "You haven't placed any bids yet."
      : 'No auctions available right now.';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live auctions</Text>
        <Pressable onPress={handleLogout}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>
      <View style={styles.tabsContainer}>
        {TABS.map((tab) => {
          const isActive = tab.key === currentTab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTabKey(tab.key)}
              style={({ pressed }) => [
                styles.tabButton,
                isActive && styles.tabButtonActive,
                pressed && styles.tabButtonPressed,
              ]}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={auctions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const expired = isAuctionExpired(item);
          const highlight =
            currentTab.key === 'participating' && expired
              ? item?.best_bid?.buyer_id === userId
                ? 'won'
                : 'lost'
              : null;
          return (
            <AuctionCard
              auction={item}
              highlight={highlight}
              onPress={() => navigation.navigate('AuctionDetail', { id: item.id })}
            />
          );
        }}
        contentContainerStyle={auctions.length === 0 ? styles.emptyContainer : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.emptyText}>{emptyMessage}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f4f8',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  logout: {
    color: '#ff4b4b',
    fontWeight: '600',
  },
  error: {
    color: '#d92d20',
    marginBottom: 12,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#e8ecf4',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#fff',
  },
  tabButtonPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3c4a64',
  },
  tabLabelActive: {
    color: '#111827',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.95,
  },
  cardHighlightWon: {
    backgroundColor: '#e6f4ea',
    borderWidth: 1,
    borderColor: '#34a853',
  },
  cardHighlightLost: {
    backgroundColor: '#fdecec',
    borderWidth: 1,
    borderColor: '#d93025',
  },
  cardImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#e5e5e5',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  cardDescription: {
    color: '#4a4a4a',
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardLabel: {
    color: '#6f6f6f',
    fontWeight: '500',
  },
  cardValue: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  cardMeta: {
    marginTop: 8,
    color: '#6f6f6f',
    fontSize: 12,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#6f6f6f',
  },
});
