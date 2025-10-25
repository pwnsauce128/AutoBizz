import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createAuction } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AdminNewAuctionForm({ onCreated }) {
  const { accessToken } = useAuth();
  const [title, setTitle] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [description, setDescription] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [carteGriseImage, setCarteGriseImage] = useState(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const MAX_IMAGES = 8;
  const remainingSlots = useMemo(() => MAX_IMAGES - selectedImages.length, [selectedImages.length]);

  const pickImage = async () => {
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

    setSelectedImages((current) => {
      const merged = [...current, ...mapped];
      if (merged.length > MAX_IMAGES) {
        return merged.slice(0, MAX_IMAGES);
      }
      return merged;
    });
  };

  const removeImage = (imageId) => {
    setSelectedImages((images) => images.filter((item) => item.id !== imageId));
  };

  const pickCarteGriseImage = async () => {
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
    setCarteGriseImage({ id, uri: asset.uri, dataUrl });
  };

  const handleCreateAuction = async () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      Alert.alert('Missing title', 'Please provide a descriptive auction name.');
      return;
    }

    if (!trimmedDescription) {
      Alert.alert('Missing description', 'Describe the vehicle to help buyers.');
      return;
    }

    const numericMinPrice = Number(minPrice);
    if (!minPrice || Number.isNaN(numericMinPrice) || numericMinPrice <= 0) {
      Alert.alert('Invalid price', 'Enter a valid minimum price greater than 0.');
      return;
    }

    if (!carteGriseImage) {
      Alert.alert('Carte grise required', 'Upload the vehicle carte grise before publishing.');
      return;
    }

    setSubmitting(true);
    try {
      await createAuction(
        {
          title: trimmedTitle,
          description: trimmedDescription,
          min_price: numericMinPrice,
          currency: 'EUR',
          images: selectedImages.map((item) => item.dataUrl),
          carte_grise_image: carteGriseImage.dataUrl,
        },
        accessToken,
      );
      setTitle('');
      setMinPrice('');
      setDescription('');
      setSelectedImages([]);
      setCarteGriseImage(null);
      Alert.alert('Auction created', 'The auction has been published successfully.');
      if (onCreated) {
        onCreated();
      }
    } catch (error) {
      Alert.alert('Creation failed', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.formTitle}>Register a new auction</Text>
        <Text style={styles.helper}>Fill in the auction details below to publish it immediately.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Auction name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 2019 Tesla Model 3"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Highlight the vehicle condition, mileage, upgrades, etc."
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Minimum price (EUR)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 25000"
            keyboardType="decimal-pad"
            value={minPrice}
            onChangeText={setMinPrice}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Vehicle photos</Text>
          <Pressable
            style={[styles.uploadButton, remainingSlots <= 0 && styles.uploadButtonDisabled]}
            onPress={pickImage}
            disabled={remainingSlots <= 0}
          >
            <Text style={styles.uploadLabel}>
              {remainingSlots <= 0 ? 'Maximum photos added' : 'Add photos'}
            </Text>
          </Pressable>
          <Text style={styles.helperSmall}>
            You can attach up to {MAX_IMAGES} photos. {Math.max(remainingSlots, 0)} remaining.
          </Text>
          {selectedImages.length > 0 ? (
            <View style={styles.previewGrid}>
              {selectedImages.map((image) => (
                <View key={image.id} style={styles.thumbnailWrapper}>
                  <Image source={{ uri: image.uri }} style={styles.thumbnail} resizeMode="cover" />
                  <Pressable style={styles.removeThumbButton} onPress={() => removeImage(image.id)}>
                    <Text style={styles.removeThumbLabel}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Carte grise photo</Text>
          <Pressable style={styles.uploadButton} onPress={pickCarteGriseImage}>
            <Text style={styles.uploadLabel}>
              {carteGriseImage ? 'Replace carte grise photo' : 'Upload carte grise'}
            </Text>
          </Pressable>
          <Text style={styles.helperSmall}>
            Add a clear photo of the vehicle registration document.
          </Text>
          {carteGriseImage ? (
            <View style={styles.cartePreview}>
              <Image source={{ uri: carteGriseImage.uri }} style={styles.carteImage} resizeMode="cover" />
              <Pressable style={styles.removeThumbButton} onPress={() => setCarteGriseImage(null)}>
                <Text style={styles.removeThumbLabel}>×</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={handleCreateAuction}
          style={({ pressed }) => [styles.submitButton, pressed && styles.submitPressed]}
          disabled={isSubmitting}
        >
          <Text style={styles.submitLabel}>{isSubmitting ? 'Creating…' : 'Create auction'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  form: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
  },
  helper: {
    color: '#4a4a4a',
    marginBottom: 16,
  },
  helperSmall: {
    color: '#6f6f6f',
    marginTop: 6,
    fontSize: 12,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    fontSize: 16,
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  uploadButton: {
    borderWidth: 1,
    borderColor: '#0f62fe',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: '#eef3ff',
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadLabel: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  thumbnailWrapper: {
    width: 78,
    height: 78,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 8,
    marginBottom: 8,
    position: 'relative',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d0d5dd',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  removeThumbButton: {
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
  removeThumbLabel: {
    color: '#fff',
    fontWeight: '700',
    lineHeight: 18,
  },
  submitButton: {
    backgroundColor: '#0f62fe',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitPressed: {
    opacity: 0.8,
  },
  submitLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
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
});
