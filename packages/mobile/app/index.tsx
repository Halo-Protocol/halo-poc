/**
 * Halo Protocol Mobile App — Phase 6 Scaffold
 *
 * Architecture notes:
 * - Uses @halo-protocol/sdk directly (zero DOM dependencies)
 * - Embedded wallet via Privy (no MetaMask required)
 * - Push notifications for contribution reminders
 * - Same backend API as web app
 *
 * TODO (Phase 6):
 * - Implement onboarding flow
 * - Circle management screens
 * - Score visualization
 * - Contribution notifications
 * - Emerging market localization (Hindi, Spanish, French)
 */

import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Halo Protocol</Text>
      <Text style={styles.subtitle}>Mobile App — Phase 6</Text>
      <Text style={styles.note}>
        Coming in Phase 6 (Months 18–24).{'\n'}
        SDK is already mobile-compatible.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#38bdf8',
    fontSize: 18,
    marginBottom: 24,
  },
  note: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
