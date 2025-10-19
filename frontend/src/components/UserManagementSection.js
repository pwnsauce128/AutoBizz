import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createUser, listUsers, updateUser } from '../api/client';

const ROLE_OPTIONS = [
  { label: 'Buyer', value: 'buyer' },
  { label: 'Seller', value: 'seller' },
  { label: 'Admin', value: 'admin' },
];

export default function UserManagementSection({ accessToken }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('buyer');
  const [isSubmitting, setSubmitting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const data = await listUsers(accessToken);
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const resetForm = () => {
    setEmail('');
    setUsername('');
    setPassword('');
    setRole('buyer');
  };

  const handleCreateUser = async () => {
    if (!email.trim() || !username.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Email, username and password are required.');
      return;
    }
    if (password.length < 12) {
      Alert.alert('Weak password', 'Password must be at least 12 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      await createUser(
        {
          email: email.trim(),
          username: username.trim(),
          password,
          role,
        },
        accessToken,
      );
      Alert.alert('User created', 'The user account has been created successfully.');
      resetForm();
      await loadUsers();
    } catch (err) {
      Alert.alert('Creation failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId, nextRole) => {
    if (updatingUserId) {
      return;
    }
    setUpdatingUserId(userId);
    try {
      await updateUser(userId, { role: nextRole }, accessToken);
      await loadUsers();
    } catch (err) {
      Alert.alert('Update failed', err.message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const renderUserCards = () => {
    if (loading) {
      return <Text style={styles.helperText}>Loading users…</Text>;
    }
    if (error) {
      return <Text style={styles.errorText}>{error}</Text>;
    }
    if (!users.length) {
      return <Text style={styles.helperText}>No users found.</Text>;
    }

    return users.map((user) => {
      const isBusy = updatingUserId === user.id;
      return (
        <View key={user.id} style={styles.userCard}>
          <View style={styles.userHeader}>
            <Text style={styles.userName}>{user.username}</Text>
            <Text style={styles.userRole}>{user.role}</Text>
          </View>
          <Text style={styles.userEmail}>{user.email}</Text>
          <Text style={styles.userMeta}>Status: {user.status}</Text>
          <View style={styles.roleButtons}>
            {ROLE_OPTIONS.map((option) => {
              const isActive = user.role === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleRoleChange(user.id, option.value)}
                  style={({ pressed }) => [
                    styles.roleButton,
                    isActive && styles.roleButtonActive,
                    pressed && styles.roleButtonPressed,
                  ]}
                  disabled={isActive || isBusy}
                >
                  <Text style={[styles.roleButtonLabel, isActive && styles.roleButtonLabelActive]}>
                    {isBusy && !isActive ? 'Updating…' : option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create new user</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Username"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <View style={styles.roleSelector}>
          {ROLE_OPTIONS.map((option) => {
            const isActive = role === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setRole(option.value)}
                style={({ pressed }) => [
                  styles.rolePill,
                  isActive && styles.rolePillActive,
                  pressed && styles.roleButtonPressed,
                ]}
              >
                <Text style={[styles.rolePillLabel, isActive && styles.rolePillLabelActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={handleCreateUser}
          style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
          disabled={isSubmitting}
        >
          <Text style={styles.submitLabel}>{isSubmitting ? 'Creating…' : 'Create user'}</Text>
        </Pressable>
      </View>

      <View style={styles.listCard}>
        <Text style={styles.cardTitle}>Existing users</Text>
        {renderUserCards()}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
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
  roleSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  rolePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
  },
  rolePillActive: {
    backgroundColor: '#0f62fe',
  },
  rolePillLabel: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  rolePillLabelActive: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#0f62fe',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonPressed: {
    opacity: 0.8,
  },
  submitLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  helperText: {
    color: '#4a4a4a',
    marginTop: 12,
  },
  errorText: {
    color: '#d92d20',
    marginTop: 12,
  },
  userCard: {
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 12,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userRole: {
    fontWeight: '600',
    color: '#0f62fe',
  },
  userEmail: {
    color: '#4a4a4a',
    marginBottom: 4,
  },
  userMeta: {
    color: '#6f6f6f',
    marginBottom: 12,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  roleButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    backgroundColor: '#fff',
  },
  roleButtonActive: {
    backgroundColor: '#0f62fe',
    borderColor: '#0f62fe',
  },
  roleButtonLabel: {
    color: '#0f62fe',
    fontWeight: '600',
  },
  roleButtonLabelActive: {
    color: '#fff',
  },
  roleButtonPressed: {
    opacity: 0.8,
  },
});
