import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
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
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isImageModalVisible, setImageModalVisible] = useState(false);

  const loadAuction = async () => {
    setLoading(true);
    try {
      const data = await fetchAuction(id);
      setAuction(data);
      const hasImages =
        (Array.isArray(data.image_urls) && data.image_urls.length > 0) ||
        (Array.isArray(data.images) && data.images.length > 0);
      if (hasImages) {
        setActiveImageIndex(0);
      }
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

  const imageUrls =
    (Array.isArray(auction.image_urls) && auction.image_urls) ||
    (Array.isArray(auction.images) && auction.images) ||
    [];
  const heroImage = imageUrls[activeImageIndex] || imageUrls[0];
  const carteGriseImage = auction.carte_grise_image_url;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{auction.title}</Text>
      <Text style={styles.subtitle}>{auction.description}</Text>
      {heroImage ? (
        <>
          <Pressable onPress={() => setImageModalVisible(true)} accessibilityRole="imagebutton">
            <Image source={{ uri: heroImage }} style={styles.heroImage} resizeMode="cover" />
          </Pressable>
          <Modal
            visible={isImageModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setImageModalVisible(false)}
          >
            <Pressable style={styles.modalBackdrop} onPress={() => setImageModalVisible(false)}>
              <Image source={{ uri: heroImage }} style={styles.modalImage} resizeMode="contain" />
            </Pressable>
          </Modal>
        </>
      ) : null}
      {imageUrls.length > 1 ? (
        <View style={styles.thumbnailGrid}>
          {imageUrls.map((url, index) => {
            const isActive = heroImage === url;
            return (
              <Pressable
                key={`${url}-${index}`}
                onPress={() => setActiveImageIndex(index)}
                style={[styles.thumbnailButton, isActive && styles.thumbnailButtonActive]}
              >
                <Image source={{ uri: url }} style={styles.thumbnailImage} resizeMode="cover" />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {carteGriseImage ? (
        <View style={styles.documentSection}>
          <Text style={styles.sectionTitle}>Carte grise</Text>
          <Text style={styles.documentHelper}>
            Seller provided the vehicle registration document.
          </Text>
          <Image
            source={{ uri: carteGriseImage }}
            style={styles.documentImage}
            resizeMode="cover"
          />
        </View>
      ) : null}
      <Text style={styles.meta}>Minimum price: {auction.min_price} {auction.currency}</Text>
      <Text style={styles.meta}>Status: {auction.status}</Text>
      {auction.end_at ? (
        <Text style={styles.meta}>Ends at {new Date(auction.end_at).toLocaleString()}</Text>
      ) : null}

      {!isBuyer ? (
        <>
          <Text style={styles.sectionTitle}>Current best bid</Text>
          <BidSummary auction={auction} />
        </>
      ) : null}

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
  thumbnailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  thumbnailButton: {
    width: 78,
    height: 78,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#fff',
  },
  thumbnailButtonActive: {
    borderColor: '#0f62fe',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
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
  documentSection: {
    marginTop: 12,
    marginBottom: 16,
  },
  documentHelper: {
    color: '#4a4a4a',
  },
  documentImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#e5e5e5',
    marginTop: 12,
  },
  info: {
    marginTop: 24,
    color: '#6f6f6f',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalImage: {
    width: '100%',
    height: '80%',
  },
});
