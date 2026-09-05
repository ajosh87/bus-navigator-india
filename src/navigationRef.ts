import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * Kept in its own module so the voice layer can drive navigation without
 * importing navigation.tsx, which imports the voice layer in turn.
 */
export const navigationRef = createNavigationContainerRef();
