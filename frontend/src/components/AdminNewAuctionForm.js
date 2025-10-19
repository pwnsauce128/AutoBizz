import React, { useState } from 'react';
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
  const [selectedImage, setSelectedImage] = useState(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow access to your photos to upload a vehicle picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets?.[0];
    if (!asset) {
      return;
    }

    const mimeType = asset.mimeType || 'image/jpeg';
    const dataUrl = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri;
    setSelectedImage({
      uri: asset.uri,
      dataUrl,
    });
  };

  const handleCreateAuction = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please provide a descriptive auction name.');
      return;
    }

    const numericMinPrice = Number(minPrice);
    if (!minPrice || Number.isNaN(numericMinPrice) || numericMinPrice <= 0) {
      Alert.alert('Invalid price', 'Enter a valid minimum price greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      await createAuction(
        {
          title: title.trim(),
          min_price: numericMinPrice,
          description: title.trim(),
          currency: 'EUR',
          images: selectedImage ? [selectedImage.dataUrl] : [],
        },
        accessToken,
      );
      setTitle('');
      setMinPrice('');
      setSelectedImage(null);
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
          <Text style={styles.label}>Vehicle photo</Text>
          {selectedImage ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: selectedImage.uri }} style={styles.preview} resizeMode="cover" />
              <Pressable onPress={() => setSelectedImage(null)} style={styles.clearButton}>
                <Text style={styles.clearLabel}>Remove photo</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.uploadButton} onPress={pickImage}>
              <Text style={styles.uploadLabel}>Upload a photo</Text>
            </Pressable>
          )}
          {selectedImage ? null : (
            <Text style={styles.helperSmall}>Supported formats: jpg, png. The selected image is attached to the listing.</Text>
          )}
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
  uploadButton: {
    borderWidth: 1,
    borderColor: '#0f62fe',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: '#eef3ff',
  },
  uploadLabel: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  previewContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    height: 200,
  },
  clearButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0d5dd',
  },
  clearLabel: {
    color: '#d92d20',
    fontWeight: '600',
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
});
