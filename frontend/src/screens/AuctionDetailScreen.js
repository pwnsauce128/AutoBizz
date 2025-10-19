import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchAuction, placeBid } from '../api/client';
import LoadingOverlay from '../components/LoadingOverlay';
import { useAuth } from '../context/AuthContext';

function BidSummary({ auction }) {
  const bestBid = auction.best_bid;
  if (!bestBid) {
    return <Text style={styles.empty}>No bids yet. Be the first!</Text>;
  }
  return (
    <View style={styles.bidRow}>
      <Text style={styles.bidAmount}>
        {bestBid.amount} {auction.currency}
      </Text>
      <Text style={styles.bidMeta}>Placed at {new Date(bestBid.created_at).toLocaleString()}</Text>
    </View>
  );
}

export default function AuctionDetailScreen({ route }) {
  const { id } = route.params;
  const { accessToken, role } = useAuth();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  const loadAuction = async () => {
    setLoading(true);
    try {
      const data = await fetchAuction(id);
      setAuction(data);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuction();
  }, []);

  const handleBid = async () => {
    const numericAmount = Number(bidAmount);
    if (!bidAmount || Number.isNaN(numericAmount)) {
      Alert.alert('Enter amount', 'Please enter a valid bid amount.');
      return;
    }
    setSubmitting(true);
    try {
      await placeBid(id, numericAmount, accessToken);
      setBidAmount('');
      await loadAuction();
      Alert.alert('Bid placed', 'Your bid has been submitted.');
    } catch (error) {
      Alert.alert('Bid failed', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingOverlay />;
  }

  if (!auction) {
    return (
      <View style={styles.centered}>
        <Text>Unable to load auction.</Text>
      </View>
    );
  }

  const isBuyer = role === 'buyer';
  const canBid = Boolean(accessToken && isBuyer);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{auction.title}</Text>
      <Text style={styles.subtitle}>{auction.description}</Text>
      {auction.image_urls && auction.image_urls[0] ? (
        <Image source={{ uri: auction.image_urls[0] }} style={styles.heroImage} resizeMode="cover" />
      ) : null}
      <Text style={styles.meta}>Minimum price: {auction.min_price} {auction.currency}</Text>
      <Text style={styles.meta}>Status: {auction.status}</Text>
      {auction.end_at ? (
        <Text style={styles.meta}>Ends at {new Date(auction.end_at).toLocaleString()}</Text>
      ) : null}

      <Text style={styles.sectionTitle}>Current best bid</Text>
      <BidSummary auction={auction} />

      {canBid ? (
        <View style={styles.bidBox}>
          <Text style={styles.bidLabel}>Place your bid</Text>
          <TextInput
            style={styles.bidInput}
            placeholder={`Amount in ${auction.currency}`}
            keyboardType="decimal-pad"
            value={bidAmount}
            onChangeText={setBidAmount}
          />
          <Pressable
            onPress={handleBid}
            style={({ pressed }) => [styles.bidButton, pressed && styles.bidButtonPressed]}
            disabled={isSubmitting}
          >
            <Text style={styles.bidButtonLabel}>{isSubmitting ? 'Submitting…' : 'Submit bid'}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.info}>Log in as a buyer to place bids.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f4f8',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#4a4a4a',
    marginBottom: 16,
  },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 16,
    backgroundColor: '#e5e5e5',
  },
  meta: {
    fontSize: 14,
    color: '#6f6f6f',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
  },
  empty: {
    color: '#6f6f6f',
  },
  bidRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d5dd',
  },
  bidAmount: {
    fontWeight: '600',
    fontSize: 16,
  },
  bidMeta: {
    color: '#6f6f6f',
    fontSize: 12,
  },
  bidBox: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  bidLabel: {
    fontWeight: '600',
    marginBottom: 8,
  },
  bidInput: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  bidButton: {
    backgroundColor: '#0f62fe',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bidButtonPressed: {
    opacity: 0.7,
  },
  bidButtonLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  info: {
    marginTop: 24,
    color: '#6f6f6f',
  },
});
