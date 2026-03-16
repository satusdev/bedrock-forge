import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';

let _socket: Socket | null = null;

export function getSocket(): Socket {
	if (!_socket) {
		const token = useAuthStore.getState().accessToken;
		_socket = io('/ws', {
			auth: { token },
			reconnectionAttempts: 10,
			reconnectionDelay: 2000,
		});
	}
	return _socket;
}

export function destroySocket() {
	_socket?.disconnect();
	_socket = null;
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
