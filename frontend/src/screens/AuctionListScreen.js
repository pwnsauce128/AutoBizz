import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function formatCurrency(amount, currency) {
  if (amount === null || amount === undefined) {
    return null;
  }
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount)) {
    return `${amount}`;
  }
  if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'EUR',
        maximumFractionDigits: 2,
      }).format(numericAmount);
    } catch (error) {
      // Fall back to a manual format below
    }
  }
  const normalizedCurrency = currency || 'EUR';
  return `${numericAmount.toFixed(2)} ${normalizedCurrency}`;
}

function AuctionCard({ auction, onPress, highlight, buyerBidAmount }) {
  const previewImage =
    (Array.isArray(auction.image_urls) && auction.image_urls[0]) ||
    (Array.isArray(auction.images) && auction.images[0]) ||
    null;
  const formattedBuyerBid = buyerBidAmount != null ? formatCurrency(buyerBidAmount, auction.currency) : null;
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
      {formattedBuyerBid ? <Text style={styles.cardBidAmount}>Your bid: {formattedBuyerBid}</Text> : null}
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

function sanitizeAuctionsForTab(list, tabKey) {
  if (!Array.isArray(list)) {
    return [];
  }
  if (tabKey === 'all') {
    return list.filter((auction) => !isAuctionExpired(auction));
  }
  return [...list];
}

function mergeAuctions(existing, incoming) {
  if (!existing?.length) {
    return incoming ? [...incoming] : [];
  }
  if (!incoming?.length) {
    return [...existing];
  }

  const merged = [];
  const seenIds = new Set();

  incoming.forEach((item) => {
    if (!item || !item.id) {
      return;
    }
    merged.push(item);
    seenIds.add(item.id);
  });

  existing.forEach((item) => {
    if (!item || !item.id) {
      return;
    }
    if (!seenIds.has(item.id)) {
      merged.push(item);
    }
  });

  return merged;
}

function sortAuctionsByCreatedAt(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  const copy = [...list];
  copy.sort((a, b) => {
    const fallback = Number.MIN_SAFE_INTEGER;
    const aTime = new Date(a?.created_at || a?.start_at || 0).getTime();
    const bTime = new Date(b?.created_at || b?.start_at || 0).getTime();
    const normalizedATime = Number.isNaN(aTime) ? fallback : aTime;
    const normalizedBTime = Number.isNaN(bTime) ? fallback : bTime;
    return normalizedBTime - normalizedATime;
  });
  return copy;
}

function getLatestCreatedAt(list) {
  if (!Array.isArray(list)) {
    return null;
  }
  let latest = null;
  list.forEach((item) => {
    if (!item?.created_at) {
      return;
    }
    const parsed = new Date(item.created_at).getTime();
    if (Number.isNaN(parsed)) {
      return;
    }
    if (latest === null || parsed > latest) {
      latest = parsed;
    }
  });
  return latest ? new Date(latest).toISOString() : null;
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
  const isFirstLoadRef = useRef(true);
  const cacheRef = useRef(new Map());
  const activeTabKeyRef = useRef(activeTabKey);
  const requestStateRef = useRef(new Map());

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  const currentTab = useMemo(
    () => TABS.find((tab) => tab.key === activeTabKey) || TABS[0],
    [activeTabKey],
  );

  useEffect(() => {
    activeTabKeyRef.current = activeTabKey;
    requestStateRef.current.forEach((state, key) => {
      if (key !== activeTabKey && state?.controller) {
        state.controller.abort();
        requestStateRef.current.set(key, { ...state, controller: null });
      }
    });
  }, [activeTabKey]);

  useEffect(() => {
    return () => {
      requestStateRef.current.forEach((state) => {
        if (state?.controller) {
          state.controller.abort();
        }
      });
    };
  }, []);

  const loadAuctions = useCallback(
    async (tab, { showSpinner = false, forceReload = false } = {}) => {
      if (!tab) {
        return;
      }
      const cacheKey = tab.key;
      const isActiveTab = () => activeTabKeyRef.current === cacheKey;
      const existingState = requestStateRef.current.get(cacheKey);
      if (existingState?.controller) {
        existingState.controller.abort();
      }
      const controller = new AbortController();
      const requestId = (existingState?.latestRequestId || 0) + 1;
      requestStateRef.current.set(cacheKey, { latestRequestId: requestId, controller });
      const isLatestRequest = () => requestStateRef.current.get(cacheKey)?.latestRequestId === requestId;
      const finalizeRequestState = () => {
        const state = requestStateRef.current.get(cacheKey);
        if (state?.latestRequestId === requestId) {
          requestStateRef.current.set(cacheKey, { latestRequestId: requestId, controller: null });
        }
      };

      const cachedEntry = cacheRef.current.get(cacheKey);
      const cachedItems = cachedEntry
        ? sortAuctionsByCreatedAt(sanitizeAuctionsForTab(cachedEntry.items, tab.key))
        : null;

      if (cachedEntry) {
        cacheRef.current.set(cacheKey, {
          items: cachedItems ?? [],
          lastFetchedAt: cachedEntry.lastFetchedAt,
        });
      }

      if (cachedItems) {
        if (isActiveTab()) {
          setAuctions(cachedItems);
          setLoading(false);
        }
      } else if (showSpinner && isActiveTab()) {
        setLoading(true);
      }
      if (isActiveTab()) {
        setError(null);
      }
      try {
        const params = { status: tab.status };
        if (tab.scope) {
          if (!accessToken) {
            throw new Error('Log in to view auctions you have bid on.');
          }
          params.scope = tab.scope;
          params.token = accessToken;
        }
        if (accessToken && !params.token) {
          params.token = accessToken;
        }
        if (!forceReload && cachedEntry?.lastFetchedAt) {
          params.createdAfter = cachedEntry.lastFetchedAt;
        }
        const data = await listAuctions(params, { signal: controller.signal });
        const sanitizedIncoming = sanitizeAuctionsForTab(data, tab.key);
        const baseList =
          forceReload || !cachedItems ? sanitizedIncoming : mergeAuctions(cachedItems, sanitizedIncoming);
        const sorted = sortAuctionsByCreatedAt(baseList);
        const latestCreatedAt = getLatestCreatedAt(sorted);
        const nextLastFetchedAt =
          latestCreatedAt ?? cachedEntry?.lastFetchedAt ?? (sanitizedIncoming.length > 0 ? new Date().toISOString() : null);
        if (!isLatestRequest()) {
          return;
        }
        cacheRef.current.set(cacheKey, {
          items: sorted,
          lastFetchedAt: nextLastFetchedAt,
        });
        if (isActiveTab()) {
          setAuctions(sorted);
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          return;
        }
        if (!isLatestRequest()) {
          return;
        }
        if (isActiveTab()) {
          setError(err.message);
          if (!cachedItems || forceReload) {
            setAuctions([]);
          }
        }
      } finally {
        if (!isLatestRequest()) {
          return;
        }
        finalizeRequestState();
        if (showSpinner || !cachedItems || forceReload) {
          if (isActiveTab()) {
            setLoading(false);
          }
        }
        setRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    let isActive = true;

    const runInitialLoad = async () => {
      const cachedEntry = cacheRef.current.get(currentTab.key);
      const shouldShowSpinner = isFirstLoadRef.current || !cachedEntry;
      await loadAuctions(currentTab, { showSpinner: shouldShowSpinner, forceReload: !cachedEntry });
      if (isActive && isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
      }
    };

    runInitialLoad();

    return () => {
      isActive = false;
    };
  }, [currentTab, loadAuctions]);

  useFocusEffect(
    useCallback(() => {
      if (isFirstLoadRef.current) {
        return;
      }
      loadAuctions(currentTab, { forceReload: true });
    }, [currentTab, loadAuctions]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadAuctions(currentTab, { forceReload: true });
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
        <View style={styles.headerText}>
          <Text style={styles.title}>Buyer marketplace</Text>
          <Text style={styles.subtitle}>Browse live auctions and keep track of your bids</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>
      <View style={styles.tabBar}>
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
      <View style={styles.content}>
        <FlatList
          data={auctions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const expired = isAuctionExpired(item);
            if (currentTab.key === 'all' && expired) {
              return null;
            }
            const highlight =
              currentTab.key === 'participating' && expired
                ? item?.best_bid?.buyer_id === userId
                  ? 'won'
                  : 'lost'
                : null;
            const buyerBidAmount =
              currentTab.key === 'participating'
                ? item?.user_bid?.amount ??
                  (item?.best_bid?.buyer_id === userId ? item?.best_bid?.amount : null)
                : null;
            return (
              <AuctionCard
                auction={item}
                highlight={highlight}
                buyerBidAmount={buyerBidAmount}
                onPress={() => navigation.navigate('AuctionDetail', { id: item.id })}
              />
            );
          }}
          contentContainerStyle={
            auctions.length === 0 ? [styles.listContent, styles.emptyContainer] : styles.listContent
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyMessage}</Text>}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
    color: '#ffffff',
  },
  subtitle: {
    marginTop: 4,
    color: '#e2e8f0',
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
  error: {
    color: '#d92d20',
    marginHorizontal: 20,
    marginBottom: 12,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  tabButtonPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontWeight: '500',
    color: '#e2e8f0',
  },
  tabLabelActive: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    marginTop: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.95,
  },
  cardHighlightWon: {
    backgroundColor: 'rgba(52, 168, 83, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(52, 168, 83, 0.6)',
  },
  cardHighlightLost: {
    backgroundColor: 'rgba(217, 48, 37, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(217, 48, 37, 0.6)',
  },
  cardImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
    color: '#ffffff',
  },
  cardDescription: {
    color: '#e2e8f0',
    marginBottom: 12,
  },
  cardBidAmount: {
    marginBottom: 8,
    color: '#0f62fe',
    fontWeight: '600',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardLabel: {
    color: '#e5e7eb',
    fontWeight: '500',
  },
  cardValue: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  cardMeta: {
    marginTop: 8,
    color: '#e5e7eb',
    fontSize: 12,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#e5e7eb',
  },
});
