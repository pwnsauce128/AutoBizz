import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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

const MAX_IMAGES = 8;

function AuctionRow({ auction, onEditPress, onDeletePress, isDeleting }) {
  const previewImage =
    (Array.isArray(auction.image_urls) && auction.image_urls[0]) ||
    (Array.isArray(auction.images) && auction.images[0]) ||
    null;

  return (
    <View style={styles.card}>
      {previewImage ? (
        <Image source={{ uri: previewImage }} style={styles.cardImage} resizeMode="cover" />
      ) : null}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{auction.title}</Text>
        <Text style={styles.cardStatus}>{auction.status}</Text>
      </View>
      {auction.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {auction.description}
        </Text>
      ) : null}
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
  const [formImages, setFormImages] = useState([]);
  const [formCarteGriseImage, setFormCarteGriseImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const emptyMessage = EMPTY_LIST_MESSAGE[mode] || EMPTY_LIST_MESSAGE.seller;

  const remainingSlots = useMemo(
    () => Math.max(0, MAX_IMAGES - formImages.length),
    [formImages.length],
  );

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
        const existingImages = Array.isArray(detail.image_urls)
          ? detail.image_urls
          : Array.isArray(detail.images)
          ? detail.images
          : [];
        setFormImages(
          existingImages.map((url, index) => ({
            id: `${url}-${index}`,
            uri: url,
            dataUrl: url,
          })),
        );
        if (detail.carte_grise_image_url) {
          setFormCarteGriseImage({
            id: `${detail.carte_grise_image_url}-carte`,
            uri: detail.carte_grise_image_url,
            dataUrl: detail.carte_grise_image_url,
          });
        } else {
          setFormCarteGriseImage(null);
        }
      } catch (err) {
        Alert.alert('Unable to load auction', err.message);
      }
    },
    [],
  );

  const cancelEdit = () => {
    setEditingId(null);
    setFormValues({ title: '', description: '', min_price: '' });
    setFormImages([]);
    setFormCarteGriseImage(null);
  };

  const pickImages = useCallback(async () => {
    if (remainingSlots <= 0) {
      Alert.alert('Limit reached', `You can upload up to ${MAX_IMAGES} photos per auction.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow access to your photos to upload a vehicle picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
    });

    if (result.canceled) {
      return;
    }

    const assets = result.assets || [];
    if (!assets.length) {
      return;
    }

    const mapped = assets.slice(0, remainingSlots).map((asset, index) => {
      const mimeType = asset.mimeType || 'image/jpeg';
      const dataUrl = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri;
      const id = asset.assetId || `${asset.uri}-${Date.now()}-${index}`;
      return {
        id,
        uri: asset.uri,
        dataUrl,
      };
    });

    setFormImages((current) => {
      const merged = [...current, ...mapped];
      if (merged.length > MAX_IMAGES) {
        return merged.slice(0, MAX_IMAGES);
      }
      return merged;
    });
  }, [remainingSlots]);

  const removeImage = useCallback((imageId) => {
    setFormImages((images) => images.filter((item) => item.id !== imageId));
  }, []);

  const pickCarteGriseImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo access to upload the carte grise.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: false,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets && result.assets[0];
    if (!asset) {
      return;
    }

    const mimeType = asset.mimeType || 'image/jpeg';
    const dataUrl = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri;
    const id = asset.assetId || `${asset.uri}-${Date.now()}`;
    setFormCarteGriseImage({ id, uri: asset.uri, dataUrl });
  }, []);

  const handleSave = async () => {
    if (!editingId) {
      return;
    }
    if (!formValues.title.trim()) {
      Alert.alert('Missing title', 'Please provide a title for the auction.');
      return;
    }
    if (!formValues.description.trim()) {
      Alert.alert('Missing description', 'Please describe the vehicle.');
      return;
    }
    const numericPrice = Number(formValues.min_price);
    if (!formValues.min_price || Number.isNaN(numericPrice) || numericPrice <= 0) {
      Alert.alert('Invalid price', 'Enter a minimum price greater than 0.');
      return;
    }

    if (!formCarteGriseImage) {
      Alert.alert('Carte grise required', 'Upload the carte grise before saving changes.');
      return;
    }

    setSaving(true);
    try {
      await updateAuction(
        editingId,
        {
          title: formValues.title.trim(),
          description: formValues.description.trim(),
          min_price: numericPrice,
          images: formImages.map((item) => item.dataUrl),
          carte_grise_image: formCarteGriseImage.dataUrl,
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
          <View style={styles.imageSection}>
            <Pressable
              style={[styles.imageButton, remainingSlots <= 0 && styles.imageButtonDisabled]}
              onPress={pickImages}
              disabled={remainingSlots <= 0}
            >
              <Text style={styles.imageButtonLabel}>
                {remainingSlots <= 0 ? 'Maximum photos added' : 'Add photos'}
              </Text>
            </Pressable>
            <Text style={styles.imageHelper}>
              You can attach up to {MAX_IMAGES} photos. {remainingSlots} remaining.
            </Text>
            {formImages.length ? (
              <View style={styles.imageGrid}>
                {formImages.map((image) => (
                  <View key={image.id} style={styles.imageWrapper}>
                    <Image source={{ uri: image.uri }} style={styles.imageThumbnail} resizeMode="cover" />
                    <Pressable
                      style={styles.removeImageButton}
                      onPress={() => removeImage(image.id)}
                    >
                      <Text style={styles.removeImageLabel}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.imagePlaceholder}>No photos added yet.</Text>
            )}
          </View>
          <View style={styles.carteSection}>
            <Text style={styles.carteLabel}>Carte grise photo</Text>
            <Pressable style={styles.carteButton} onPress={pickCarteGriseImage}>
              <Text style={styles.carteButtonLabel}>
                {formCarteGriseImage ? 'Replace carte grise photo' : 'Upload carte grise'}
              </Text>
            </Pressable>
            <Text style={styles.carteHelper}>
              The registration document is required for all auctions.
            </Text>
            {formCarteGriseImage ? (
              <View style={styles.cartePreview}>
                <Image
                  source={{ uri: formCarteGriseImage.uri }}
                  style={styles.carteImage}
                  resizeMode="cover"
                />
                <Pressable
                  style={styles.removeCarteButton}
                  onPress={() => setFormCarteGriseImage(null)}
                >
                  <Text style={styles.removeImageLabel}>×</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.cartePlaceholder}>No carte grise uploaded yet.</Text>
            )}
          </View>
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
  cardImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#e5e5e5',
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
  cardDescription: {
    color: '#4a4a4a',
    marginBottom: 8,
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
  imageSection: {
    marginBottom: 16,
  },
  imageButton: {
    borderWidth: 1,
    borderColor: '#0f62fe',
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: '#eef3ff',
  },
  imageButtonDisabled: {
    opacity: 0.5,
  },
  imageButtonLabel: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  imageHelper: {
    marginTop: 6,
    color: '#6f6f6f',
    fontSize: 12,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  imageWrapper: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 8,
    marginBottom: 8,
    position: 'relative',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d0d5dd',
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 98, 254, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageLabel: {
    color: '#fff',
    fontWeight: '700',
    lineHeight: 18,
  },
  carteSection: {
    marginBottom: 16,
  },
  carteLabel: {
    fontWeight: '600',
    marginBottom: 8,
  },
  carteButton: {
    borderWidth: 1,
    borderColor: '#0f62fe',
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: '#eef3ff',
  },
  carteButtonLabel: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  carteHelper: {
    marginTop: 6,
    color: '#6f6f6f',
    fontSize: 12,
  },
  cartePreview: {
    marginTop: 12,
    alignSelf: 'flex-start',
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    backgroundColor: '#fff',
  },
  carteImage: {
    width: 200,
    height: 140,
  },
  removeCarteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15, 98, 254, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartePlaceholder: {
    marginTop: 10,
    color: '#6f6f6f',
    fontSize: 12,
  },
  imagePlaceholder: {
    marginTop: 10,
    color: '#6f6f6f',
    fontSize: 12,
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
