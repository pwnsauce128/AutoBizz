import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function LoadingOverlay() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0f62fe" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
