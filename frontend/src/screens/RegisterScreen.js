import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { register as registerRequest } from '../api/client';

export default function RegisterScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setLoading(true);
    try {
      await registerRequest({ username, email, password });
      Alert.alert('Success', 'Account created. You can now log in.', [
        {
          text: 'Go to login',
          onPress: () =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            }),
        },
      ]);
    } catch (error) {
      Alert.alert('Registration failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Join AutoBizz</Text>
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          autoCapitalize="none"
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          onPress={handleRegister}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          disabled={loading}
        >
          <Text style={styles.buttonLabel}>{loading ? 'Creating account…' : 'Create account'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
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
  button: {
    backgroundColor: '#0f62fe',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
