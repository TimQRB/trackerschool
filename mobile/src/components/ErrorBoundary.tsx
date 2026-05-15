import React, { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Feather name="alert-triangle" size={48} color="#dc2626" style={styles.emoji} />
          <Text style={styles.title}>Что-то пошло не так</Text>
          <Text style={styles.message}>{this.state.error?.message}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' },
  emoji: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  message: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8 },
  button: { backgroundColor: '#1e3a8a', borderRadius: 10, padding: 12, paddingHorizontal: 32, marginTop: 20 },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '600' },
});
