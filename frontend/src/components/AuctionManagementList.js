import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  deleteAuction,
  fetchAuction,
  listManageAuctions,
  listMyAuctions,
  exportManageAuctionsCSV,
  updateAuction,
} from '../api/client';

const EMPTY_LIST_MESSAGE = {
  admin: 'No auctions found.',
  seller: "You have not created any auctions yet.",
};

const MAX_IMAGES = 8;

function AuctionRow({
  auction,
  onEditPress,
  onDeletePress,
  onViewPress,
  isDeleting,
  mode = 'seller',
}) {
  const previewImage =
    (Array.isArray(auction.image_urls) && auction.image_urls[0]) ||
    (Array.isArray(auction.images) && auction.images[0]) ||
    null;
  const bestBid = auction.best_bid;
  const highestBidder = bestBid?.buyer_username || null;
  const highestBidderLabel = bestBid ? highestBidder || 'Unknown bidder' : 'No bids yet';
  const highestBidLabel = bestBid ? `${bestBid.amount} ${auction.currency}` : 'No bids yet';
  const isSellerView = mode === 'seller';
  const hasWinningBid = Boolean(bestBid && highestBidder);
  const isExpired = auction.end_at ? new Date(auction.end_at) < new Date() : false;
  const shouldHighlight = isSellerView && isExpired && hasWinningBid;
  const sellerLabel = auction.seller_username || 'Unknown seller';

  const handleCardPress = () => {
    if (onViewPress) {
      onViewPress(auction.id);
    }
  };

  return (
    <Pressable
      onPress={handleCardPress}
      style={({ pressed }) => [
        styles.card,
        shouldHighlight && styles.cardHighlighted,
        pressed && styles.cardPressed,
      ]}
    >
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
        <Text style={styles.cardLabel}>Highest bidder</Text>
        <Text style={[styles.cardValue, !bestBid && styles.cardValueMuted]}>
          {highestBidderLabel}
        </Text>
      </View>
      {mode === 'admin' ? (
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Seller</Text>
          <Text style={styles.cardValue}>{sellerLabel}</Text>
        </View>
      ) : null}
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Highest bid</Text>
        <Text style={[styles.cardValue, !bestBid && styles.cardValueMuted]}>
          {highestBidLabel}
        </Text>
      </View>
      {auction.end_at ? (
        <Text style={styles.cardMeta}>Ends at {new Date(auction.end_at).toLocaleString()}</Text>
      ) : null}
      <View style={styles.cardActions}>
        <Pressable
          onPress={(event) => {
            event.stopPropagation?.();
            onEditPress(auction.id);
          }}
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.actionButtonLabel}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={(event) => {
            event.stopPropagation?.();
            onDeletePress(auction.id);
          }}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.actionButtonPressed]}
          disabled={isDeleting}
        >
          <Text style={styles.deleteButtonLabel}>{isDeleting ? 'Deleting…' : 'Delete'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function AuctionManagementList({
  mode = 'seller',
  accessToken,
  refreshKey = 0,
  style,
}) {
  const navigation = useNavigation();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formValues, setFormValues] = useState({ title: '', description: '' });
  const [formImages, setFormImages] = useState([]);
  const [formCarteGriseImage, setFormCarteGriseImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [dateError, setDateError] = useState(null);
  const [activePicker, setActivePicker] = useState(null);
  const [exporting, setExporting] = useState(false);

  const listRef = useRef(null);
  const emptyMessage = EMPTY_LIST_MESSAGE[mode] || EMPTY_LIST_MESSAGE.seller;

  const remainingSlots = useMemo(
    () => Math.max(0, MAX_IMAGES - formImages.length),
    [formImages.length],
  );

  const normalizeStartOfDay = useCallback((date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }, []);

  const normalizeEndOfDay = useCallback((date) => {
    const normalized = new Date(date);
    normalized.setHours(23, 59, 59, 999);
    return normalized;
  }, []);

  const formatDateLabel = useCallback((date) => {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const formatDateForFile = useCallback((date) => date.toISOString().split('T')[0], []);

  const clearDateFilters = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
  }, []);

  const openDatePicker = useCallback(
    (field) => {
      if (mode !== 'admin') {
        return;
      }
      setActivePicker(field);
    },
    [mode],
  );

  const closePicker = useCallback(() => {
    setActivePicker(null);
  }, []);

  const handleDateChange = useCallback(
    (event, selectedDate) => {
      const eventType = event?.type;
      if (Platform.OS !== 'ios') {
        closePicker();
      }
      if (eventType === 'dismissed' || !selectedDate) {
        if (Platform.OS === 'ios') {
          closePicker();
        }
        return;
      }

      if (activePicker === 'start') {
        setStartDate(normalizeStartOfDay(selectedDate));
      } else if (activePicker === 'end') {
        setEndDate(normalizeEndOfDay(selectedDate));
      }

      if (Platform.OS === 'ios') {
        setTimeout(() => {
          closePicker();
        }, 0);
      }
    },
    [activePicker, closePicker, normalizeEndOfDay, normalizeStartOfDay],
  );

  const pickerValue = useMemo(() => {
    if (!activePicker) {
      return null;
    }
    const fallback = new Date();
    if (activePicker === 'start') {
      const base = startDate || endDate || fallback;
      const candidate = new Date(base);
      candidate.setHours(12, 0, 0, 0);
      return candidate;
    }
    const base = endDate || startDate || fallback;
    const candidate = new Date(base);
    candidate.setHours(12, 0, 0, 0);
    return candidate;
  }, [activePicker, startDate, endDate]);

  const pickerMinimumDate = useMemo(() => {
    if (activePicker !== 'end' || !startDate) {
      return undefined;
    }
    const candidate = new Date(startDate);
    candidate.setHours(12, 0, 0, 0);
    return candidate;
  }, [activePicker, startDate]);

  const pickerMaximumDate = useMemo(() => {
    if (activePicker !== 'start' || !endDate) {
      return undefined;
    }
    const candidate = new Date(endDate);
    candidate.setHours(12, 0, 0, 0);
    return candidate;
  }, [activePicker, endDate]);

  const handleExport = useCallback(async () => {
    if (mode !== 'admin') {
      return;
    }
    if (dateError) {
      Alert.alert('Invalid date range', dateError);
      return;
    }

    setExporting(true);
    try {
      const params = { status: 'all' };
      if (startDate) {
        params.createdFrom = startDate;
      }
      if (endDate) {
        params.createdTo = endDate;
      }

      const csvPayload = await exportManageAuctionsCSV(params, accessToken);
      const dateSegments = [];
      if (startDate) {
        dateSegments.push(`from-${formatDateForFile(startDate)}`);
      }
      if (endDate) {
        dateSegments.push(`to-${formatDateForFile(endDate)}`);
      }
      const fileName = `auctions${dateSegments.length ? `_${dateSegments.join('_')}` : ''}.csv`;
      const saveResult = await (async () => {
        const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
        if (directory) {
          const uri = `${directory}${fileName}`;
          await FileSystem.writeAsStringAsync(uri, csvPayload, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          return { fileUri: uri, supportsSharing: true };
        }

        if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!permissions.granted) {
            throw new Error('Storage permission not granted for export.');
          }

          const resolveFileUri = async (name) => {
            try {
              return await FileSystem.StorageAccessFramework.createFileAsync(
                permissions.directoryUri,
                name,
                'text/csv',
              );
            } catch (createErr) {
              return null;
            }
          };

          let writableUri = await resolveFileUri(fileName);
          if (!writableUri) {
            writableUri = await resolveFileUri(
              `auctions_${Date.now()}.csv`,
            );
          }

          if (!writableUri) {
            throw new Error('Unable to create export file in selected directory.');
          }

          await FileSystem.StorageAccessFramework.writeAsStringAsync(writableUri, csvPayload, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          return { fileUri: writableUri, supportsSharing: false };
        }

        throw new Error('No writable directory available for export.');
      })();

      const sharingAvailable = saveResult.supportsSharing && (await Sharing.isAvailableAsync());
      if (sharingAvailable) {
        await Sharing.shareAsync(saveResult.fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export auctions',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Export complete', `CSV saved to ${saveResult.fileUri}`);
      }
    } catch (err) {
      Alert.alert('Export failed', err.message);
    } finally {
      setExporting(false);
    }
  }, [mode, dateError, startDate, endDate, accessToken, formatDateForFile]);

  const loadAuctions = useCallback(async () => {
    if (mode === 'admin' && dateError) {
      setLoading(false);
      setError(null);
      setAuctions([]);
      return;
    }

    setLoading(true);
    try {
      setError(null);
      const loader = mode === 'admin' ? listManageAuctions : listMyAuctions;
      const params = { status: 'all' };
      if (mode === 'admin') {
        if (startDate) {
          params.createdFrom = startDate;
        }
        if (endDate) {
          params.createdTo = endDate;
        }
      }
      const data = await loader(params, accessToken);
      setAuctions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, accessToken, startDate, endDate, dateError]);

  useEffect(() => {
    if (mode !== 'admin') {
      setStartDate(null);
      setEndDate(null);
      setDateError(null);
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setDateError('Start date cannot be after end date.');
    } else {
      setDateError(null);
    }
  }, [mode, startDate, endDate]);

  useEffect(() => {
    loadAuctions();
  }, [loadAuctions, refreshKey]);

  useEffect(() => {
    if (editingId && listRef.current) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [editingId]);

  const handleEditPress = useCallback(
    async (auctionId) => {
      try {
        const detail = await fetchAuction(auctionId);
        setEditingId(auctionId);
        setFormValues({
          title: detail.title || '',
          description: detail.description || '',
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
    setFormValues({ title: '', description: '' });
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

  const handleViewPress = useCallback(
    (auctionId) => {
      if (!auctionId) {
        return;
      }
      navigation.navigate('AuctionDetail', { id: auctionId });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <AuctionRow
        auction={item}
        onEditPress={handleEditPress}
        onDeletePress={handleDelete}
        onViewPress={handleViewPress}
        isDeleting={deletingId === item.id}
        mode={mode}
      />
    ),
    [handleEditPress, handleDelete, handleViewPress, deletingId, mode],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const filterSection =
    mode === 'admin' ? (
      <View style={styles.filterContainer}>
        <Text style={styles.filterTitle}>Filter auctions by creation date</Text>
        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>From</Text>
            <Pressable style={styles.dateButton} onPress={() => openDatePicker('start')}>
              <Text
                style={[styles.dateButtonLabel, !startDate && styles.dateButtonPlaceholder]}
              >
                {startDate ? formatDateLabel(startDate) : 'Select date'}
              </Text>
            </Pressable>
          </View>
          <View style={[styles.filterField, styles.filterFieldLast]}>
            <Text style={styles.filterLabel}>To</Text>
            <Pressable style={styles.dateButton} onPress={() => openDatePicker('end')}>
              <Text
                style={[styles.dateButtonLabel, !endDate && styles.dateButtonPlaceholder]}
              >
                {endDate ? formatDateLabel(endDate) : 'Select date'}
              </Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.filterActions}>
          {startDate || endDate ? (
            <Pressable style={styles.clearButton} onPress={clearDateFilters}>
              <Text style={styles.clearButtonLabel}>Clear</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[
              styles.exportButton,
              (exporting || dateError) && styles.exportButtonDisabled,
            ]}
            onPress={handleExport}
            disabled={exporting || Boolean(dateError)}
          >
            <Text style={styles.exportButtonLabel}>
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Text>
          </Pressable>
        </View>
        {dateError ? <Text style={styles.dateError}>{dateError}</Text> : null}
        {activePicker && pickerValue ? (
          <View style={styles.datePickerWrapper}>
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
              onChange={handleDateChange}
              minimumDate={pickerMinimumDate}
              maximumDate={pickerMaximumDate}
            />
          </View>
        ) : null}
      </View>
    ) : null;

  const editSection = editingId ? (
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
                <Pressable style={styles.removeImageButton} onPress={() => removeImage(image.id)}>
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
            <Image source={{ uri: formCarteGriseImage.uri }} style={styles.carteImage} resizeMode="cover" />
            <Pressable style={styles.removeCarteButton} onPress={() => setFormCarteGriseImage(null)}>
              <Text style={styles.removeImageLabel}>×</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.cartePlaceholder}>No carte grise uploaded yet.</Text>
        )}
      </View>
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
  ) : null;

  return (
    <View style={[styles.container, style]}>
      {mode === 'admin' ? filterSection : null}
      {loading ? (
        <Text style={styles.helperText}>Loading auctions…</Text>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <FlatList
          ref={listRef}
          data={auctions}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            !auctions.length && styles.listContentEmpty,
            editingId && styles.listContentEditing,
          ]}
          ListEmptyComponent={<Text style={styles.helperText}>{emptyMessage}</Text>}
          ListFooterComponent={editSection}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  filterContainer: {
    paddingHorizontal: 0,
    paddingBottom: 16,
    alignSelf: 'stretch',
  },
  filterTitle: {
    color: '#e2e8f0',
    fontWeight: '600',
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterField: {
    flex: 1,
    marginRight: 12,
  },
  filterFieldLast: {
    marginRight: 0,
  },
  filterLabel: {
    color: '#cbd5f5',
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.6)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  dateButtonLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  dateButtonPlaceholder: {
    color: '#94a3b8',
    fontWeight: '400',
  },
  filterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.6)',
    marginRight: 12,
  },
  clearButtonLabel: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  exportButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#0f62fe',
  },
  exportButtonLabel: {
    color: '#ffffff',
    fontWeight: '600',
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  dateError: {
    color: '#fca5a5',
    marginTop: 4,
  },
  datePickerWrapper: {
    marginTop: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderRadius: 12,
    padding: 8,
  },
  list: {
    flex: 1,
  },
  helperText: {
    textAlign: 'center',
    color: '#e2e8f0',
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
  listContentEmpty: {
    flexGrow: 1,
  },
  listContentEditing: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  cardHighlighted: {
    backgroundColor: 'rgba(15, 98, 254, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(15, 98, 254, 0.6)',
  },
  cardImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#ffffff',
  },
  cardDescription: {
    color: '#e2e8f0',
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
    color: '#e5e7eb',
    fontWeight: '500',
  },
  cardValue: {
    color: '#9cc4ff',
    fontWeight: '600',
  },
  cardValueMuted: {
    color: '#cbd5f5',
  },
  cardMeta: {
    color: '#e5e7eb',
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
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  editTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#ffffff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
    color: '#ffffff',
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
    color: '#9cc4ff',
    fontWeight: '600',
  },
  imageHelper: {
    marginTop: 6,
    color: '#cbd5f5',
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
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    color: '#ffffff',
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
    color: '#9cc4ff',
    fontWeight: '600',
  },
  carteHelper: {
    marginTop: 6,
    color: '#cbd5f5',
    fontSize: 12,
  },
  cartePreview: {
    marginTop: 12,
    alignSelf: 'flex-start',
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
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
    color: '#cbd5f5',
    fontSize: 12,
  },
  imagePlaceholder: {
    marginTop: 10,
    color: '#cbd5f5',
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cancelLabel: {
    color: '#e2e8f0',
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
