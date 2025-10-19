import React, { useCallback, useEffect, useState } from 'react';
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

function AuctionCard({ auction, onPress }) {
  const bestBid = auction.best_bid;
  const previewImage =
    (Array.isArray(auction.image_urls) && auction.image_urls[0]) ||
    (Array.isArray(auction.images) && auction.images[0]) ||
    null;
  return (
    <Pressable style={styles.card} onPress={onPress}>
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
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Best bid:</Text>
        <Text style={styles.cardValue}>
          {bestBid ? `${bestBid.amount} ${auction.currency}` : 'No bids yet'}
        </Text>
      </View>
      {auction.end_at ? (
        <Text style={styles.cardMeta}>Ends at {new Date(auction.end_at).toLocaleString()}</Text>
      ) : null}
    </Pressable>
  );
}

export default function AuctionListScreen({ navigation }) {
  const { logout } = useAuth();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadAuctions = async (showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      setError(null);
      const data = await listAuctions({ status: 'active' });
      setAuctions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAuctions(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAuctions();
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadAuctions();
  };

  if (loading) {
    return <LoadingOverlay />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live auctions</Text>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={auctions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AuctionCard auction={item} onPress={() => navigation.navigate('AuctionDetail', { id: item.id })} />
        )}
        contentContainerStyle={auctions.length === 0 && styles.emptyContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No auctions available right now.</Text>}
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
