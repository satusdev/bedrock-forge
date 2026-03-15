/**
 * React hook for real-time WebSocket updates.
 *
 * Handles React StrictMode double-mount gracefully and prevents duplicate toasts.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import websocketService, { WebSocketMessage } from '@/services/websocket';

interface UseRealTimeUpdatesOptions {
	enabled?: boolean;
	onProjectUpdate?: (projectName: string, data: any) => void;
	onWordPressUpdate?: (projectName: string, data: any) => void;
	onConnectionChange?: (connected: boolean) => void;
}

export const useRealTimeUpdates = (options: UseRealTimeUpdatesOptions = {}) => {
	const {
		enabled = true,
		onProjectUpdate,
		onWordPressUpdate,
		onConnectionChange,
	} = options;

	const queryClient = useQueryClient();
	const connectionTimeoutRef = useRef<NodeJS.Timeout>();
	const isMountedRef = useRef(true);
	const hasShownConnectedToastRef = useRef(false);

	const handleConnectionChange = useCallback(
		(connected: boolean) => {
			// Only show toasts if mounted and haven't shown it yet
			if (!isMountedRef.current) return;

			onConnectionChange?.(connected);

			if (connected && !hasShownConnectedToastRef.current) {
				hasShownConnectedToastRef.current = true;
				toast.success('Real-time updates connected');
			} else if (!connected && hasShownConnectedToastRef.current) {
				// Only show disconnect if we previously showed connected
				hasShownConnectedToastRef.current = false;
				toast.error('Real-time updates disconnected');
			}
		},
		[onConnectionChange],
	);

	const handleMessage = useCallback(
		(message: WebSocketMessage) => {
			if (!isMountedRef.current) return;

			switch (message.type) {
				case 'connection':
					handleConnectionChange(message.status === 'connected');
					break;

				case 'project_update':
					if (message.project_name && message.data) {
						const updateType = message.data.type;
						const updateData = message.data.data;

						// Update cache for specific project
						queryClient.invalidateQueries(['project', message.project_name]);
						queryClient.invalidateQueries(['comprehensive-projects']);
						queryClient.invalidateQueries(['dashboard-stats']);

						// Call specific handlers
						onProjectUpdate?.(message.project_name, updateData);

						switch (updateType) {
							case 'wordpress_plugin_updated':
							case 'wordpress_theme_updated':
							case 'wordpress_core_updated':
								onWordPressUpdate?.(message.project_name, updateData);
								toast.success(`${message.project_name}: ${updateData.message}`);
								break;

							case 'backup_created':
							case 'backup_restored':
								toast.success(`${message.project_name}: ${updateData.message}`);
								break;

							default:
								// Silently ignore unhandled types
								break;
						}
					}
					break;

				case 'subscription_confirmed':
				case 'unsubscription_confirmed':
				case 'pong':
					// Handle silently
					break;

				default:
					// Silently ignore unhandled types
					break;
			}
		},
		[queryClient, onProjectUpdate, onWordPressUpdate, handleConnectionChange],
	);

	const connect = useCallback(async () => {
		if (!enabled || !isMountedRef.current) return;

		try {
			await websocketService.connect();

			// Only proceed if still mounted after async connect
			if (!isMountedRef.current) return;

			// Set up event handlers
			websocketService.on('message', handleMessage);

			// Only send ping if connection is actually open
			if (websocketService.isConnected()) {
				websocketService.ping();
			}

			// Set up periodic ping to keep connection alive
			connectionTimeoutRef.current = setInterval(() => {
				if (websocketService.isConnected() && isMountedRef.current) {
					websocketService.ping();
				}
			}, 30000); // Ping every 30 seconds
		} catch (error) {
			// Silently fail - WebSocket will auto-reconnect
			if (isMountedRef.current) {
				handleConnectionChange(false);
			}
		}
	}, [enabled, handleMessage, handleConnectionChange]);

	const disconnect = useCallback(() => {
		if (connectionTimeoutRef.current) {
			clearInterval(connectionTimeoutRef.current);
			connectionTimeoutRef.current = undefined;
		}

		websocketService.off('message', handleMessage);
		websocketService.disconnect();
	}, [handleMessage]);

	const subscribeToProject = useCallback((projectName: string) => {
		if (websocketService.isConnected()) {
			websocketService.subscribeToProject(projectName);
		}
	}, []);

	const unsubscribeFromProject = useCallback((projectName: string) => {
		if (websocketService.isConnected()) {
			websocketService.unsubscribeFromProject(projectName);
		}
	}, []);

	useEffect(() => {
		isMountedRef.current = true;
		hasShownConnectedToastRef.current = false;

		if (enabled) {
			connect();
		}

		return () => {
			isMountedRef.current = false;
			disconnect();
		};
	}, [enabled, connect, disconnect]);

	return {
		isConnected: websocketService.isConnected(),
		clientId: websocketService.getClientId(),
		connect,
		disconnect,
		subscribeToProject,
		unsubscribeFromProject,
	};
};
