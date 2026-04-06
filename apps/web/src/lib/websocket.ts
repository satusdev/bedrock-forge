import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';

let _socket: Socket | null = null;

export function getSocket(): Socket {
	if (!_socket) {
		const token = useAuthStore.getState().accessToken;
		_socket = io('/ws', {
			auth: { token },
			// No reconnectionAttempts limit — default is Infinity.
			// Exponential backoff capped at 30s prevents hammering on server downtime.
			reconnectionDelay: 1000,
			reconnectionDelayMax: 30_000,
		});
	}
	return _socket;
}

export function destroySocket() {
	_socket?.disconnect();
	_socket = null;
}

/**
 * Update the socket auth token and force an immediate reconnection so the
 * new token is used right away (not just on the next automatic reconnect).
 */
export function updateSocketToken(token: string) {
	if (_socket) {
		(_socket.auth as { token: string }).token = token;
		// Reconnect immediately with the new token
		_socket.disconnect().connect();
	}
}

type EventHandler = (data: unknown) => void;

export function useWebSocketEvent(event: string, handler: EventHandler) {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		const socket = getSocket();
		const fn = (data: unknown) => handlerRef.current(data);
		socket.on(event, fn);
		return () => {
			socket.off(event, fn);
		};
	}, [event]);
}

export function useSubscribeEnvironment(envId: number | null) {
	useEffect(() => {
		if (!envId) return;
		const socket = getSocket();
		socket.emit('subscribe:environment', { environmentId: envId });
		return () => {
			socket.emit('unsubscribe:environment', { environmentId: envId });
		};
	}, [envId]);
}
