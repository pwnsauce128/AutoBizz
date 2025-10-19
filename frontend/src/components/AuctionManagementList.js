import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  deleteAuction,
  fetchAuction,
  listManageAuctions,
  listMyAuctions,
  updateAuction,
} from '../api/client';

const EMPTY_LIST_MESSAGE = {
  admin: 'No auctions found.',
  seller: "You have not created any auctions yet.",
};

function AuctionRow({ auction, onEditPress, onDeletePress, isDeleting }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{auction.title}</Text>
        <Text style={styles.cardStatus}>{auction.status}</Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Minimum price</Text>
        <Text style={styles.cardValue}>
          {auction.min_price} {auction.currency}
        </Text>
      </View>
      {auction.end_at ? (
        <Text style={styles.cardMeta}>Ends at {new Date(auction.end_at).toLocaleString()}</Text>
      ) : null}
      <View style={styles.cardActions}>
        <Pressable
          onPress={() => onEditPress(auction.id)}
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.actionButtonLabel}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={() => onDeletePress(auction.id)}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.actionButtonPressed]}
          disabled={isDeleting}
        >
          <Text style={styles.deleteButtonLabel}>{isDeleting ? 'Deleting…' : 'Delete'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AuctionManagementList({ mode = 'seller', accessToken, refreshKey = 0 }) {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formValues, setFormValues] = useState({ title: '', description: '', min_price: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const emptyMessage = EMPTY_LIST_MESSAGE[mode] || EMPTY_LIST_MESSAGE.seller;

  const loadAuctions = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const loader = mode === 'admin' ? listManageAuctions : listMyAuctions;
      const data = await loader({ status: 'all' }, accessToken);
      setAuctions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, accessToken]);

  useEffect(() => {
    loadAuctions();
  }, [loadAuctions, refreshKey]);

  const handleEditPress = useCallback(
    async (auctionId) => {
      try {
        const detail = await fetchAuction(auctionId);
        setEditingId(auctionId);
        setFormValues({
          title: detail.title || '',
          description: detail.description || '',
          min_price: String(detail.min_price ?? ''),
        });
      } catch (err) {
        Alert.alert('Unable to load auction', err.message);
      }
    },
    [],
  );

  const cancelEdit = () => {
    setEditingId(null);
    setFormValues({ title: '', description: '', min_price: '' });
  };

  const handleSave = async () => {
    if (!editingId) {
      return;
    }
    if (!formValues.title.trim()) {
      Alert.alert('Missing title', 'Please provide a title for the auction.');
      return;
    }
    const numericPrice = Number(formValues.min_price);
    if (!formValues.min_price || Number.isNaN(numericPrice) || numericPrice <= 0) {
      Alert.alert('Invalid price', 'Enter a minimum price greater than 0.');
      return;
    }

    setSaving(true);
    try {
      await updateAuction(
        editingId,
        {
          title: formValues.title.trim(),
          description: formValues.description.trim() || formValues.title.trim(),
          min_price: numericPrice,
        },
        accessToken,
      );
      Alert.alert('Auction updated', 'Changes have been saved.');
      cancelEdit();
      await loadAuctions();
    } catch (err) {
      Alert.alert('Update failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (auctionId) => {
    Alert.alert('Delete auction', 'Are you sure you want to delete this auction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(auctionId);
          try {
            await deleteAuction(auctionId, accessToken);
            await loadAuctions();
          } catch (err) {
            Alert.alert('Delete failed', err.message);
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const renderItem = useCallback(
    ({ item }) => (
      <AuctionRow
        auction={item}
        onEditPress={handleEditPress}
        onDeletePress={handleDelete}
        isDeleting={deletingId === item.id}
      />
    ),
    [handleEditPress, handleDelete, deletingId],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const content = useMemo(() => {
    if (loading) {
      return <Text style={styles.helperText}>Loading auctions…</Text>;
    }
    if (error) {
      return <Text style={styles.errorText}>{error}</Text>;
    }
    if (!auctions.length) {
      return <Text style={styles.helperText}>{emptyMessage}</Text>;
    }
    return (
      <FlatList
        data={auctions}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
      />
    );
  }, [auctions, emptyMessage, error, keyExtractor, loading, renderItem]);

  return (
    <View style={styles.container}>
      {content}
      {editingId ? (
        <View style={styles.editCard}>
          <Text style={styles.editTitle}>Edit auction</Text>
          <TextInput
            style={styles.input}
            placeholder="Title"
            value={formValues.title}
            onChangeText={(value) => setFormValues((current) => ({ ...current, title: value }))}
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Description"
            multiline
            value={formValues.description}
            onChangeText={(value) => setFormValues((current) => ({ ...current, description: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Minimum price"
            keyboardType="decimal-pad"
            value={formValues.min_price}
            onChangeText={(value) => setFormValues((current) => ({ ...current, min_price: value }))}
          />
          <View style={styles.editActions}>
            <Pressable
              onPress={cancelEdit}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.actionButtonPressed]}
              disabled={saving}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
              disabled={saving}
            >
              <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save changes'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  helperText: {
    textAlign: 'center',
    color: '#4a4a4a',
    marginTop: 32,
  },
  errorText: {
    textAlign: 'center',
    color: '#d92d20',
    marginTop: 16,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  cardStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f62fe',
    textTransform: 'uppercase',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    color: '#6f6f6f',
    fontSize: 12,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonLabel: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ffe5e5',
  },
  deleteButtonLabel: {
    color: '#d92d20',
    fontWeight: '600',
  },
  editCard: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  editTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
  },
  cancelLabel: {
    color: '#4a4a4a',
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0f62fe',
  },
  saveButtonPressed: {
    opacity: 0.8,
  },
  saveLabel: {
    color: '#fff',
    fontWeight: '600',
  },
});
