import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { listAuctions } from '../api/client';

function AuctionPreviewCard({ auction, onPress }) {
  const bestBid = auction.best_bid;
  const hasBestBid = Boolean(bestBid);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.cardTitle}>{auction.title}</Text>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Minimum price</Text>
        <Text style={styles.cardValue}>
          {auction.min_price} {auction.currency}
        </Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Best bid</Text>
        <Text style={styles.cardValue}>
          {hasBestBid ? `${bestBid.amount} ${auction.currency}` : 'No bids yet'}
        </Text>
      </View>
      <Text style={styles.cardStatus}>{auction.status}</Text>
    </Pressable>
  );
}

export default function SellerAuctionBrowseList({ accessToken, refreshKey = 0 }) {
  const navigation = useNavigation();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadAuctions = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setLoading(true);
      }
      try {
        setError(null);
        const data = await listAuctions({ status: 'all', token: accessToken });
        setAuctions(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    loadAuctions(true);
  }, [loadAuctions]);

  useEffect(() => {
    if (refreshKey > 0) {
      loadAuctions();
    }
  }, [refreshKey, loadAuctions]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAuctions();
  }, [loadAuctions]);

  const renderItem = useCallback(
    ({ item }) => (
      <AuctionPreviewCard
        auction={item}
        onPress={() => navigation.navigate('AuctionDetail', { id: item.id })}
      />
    ),
    [navigation],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const listEmptyComponent = useMemo(() => {
    if (loading) {
      return <Text style={styles.helperText}>Loading auctions…</Text>;
    }
    if (error) {
      return <Text style={styles.errorText}>{error}</Text>;
    }
    return <Text style={styles.helperText}>No auctions found.</Text>;
  }, [error, loading]);

  return (
    <View style={styles.container}>
      {error && !loading ? <Text style={styles.errorText}>{error}</Text> : null}
      <FlatList
        data={auctions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, auctions.length === 0 && styles.emptyContent]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          auctions.length
            ? (
                <Text style={styles.infoText}>
                  Browse every auction in the marketplace. Editing is only available for your own
                  listings.
                </Text>
              )
            : null
        }
        ListEmptyComponent={listEmptyComponent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  helperText: {
    textAlign: 'center',
    color: '#4a4a4a',
    marginTop: 24,
  },
  errorText: {
    textAlign: 'center',
    color: '#d92d20',
    marginBottom: 12,
  },
  infoText: {
    color: '#4a4a4a',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
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
  cardStatus: {
    marginTop: 8,
    color: '#6f6f6f',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
