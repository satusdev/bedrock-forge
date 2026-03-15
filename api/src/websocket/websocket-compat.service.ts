import { Injectable } from '@nestjs/common';
import type WebSocket from 'ws';

type WebSocketLike = Pick<WebSocket, 'send' | 'readyState'>;

@Injectable()
export class WebsocketCompatService {
	private readonly activeConnections = new Map<string, WebSocketLike>();
	private readonly projectSubscribers = new Map<string, Set<string>>();

	connect(clientId: string, socket: WebSocketLike) {
		this.activeConnections.set(clientId, socket);
		this.sendPersonalMessage(
			{
				type: 'connection',
				status: 'connected',
				client_id: clientId,
				timestamp: new Date().toISOString(),
			},
			clientId,
		);
	}

	disconnect(clientId: string) {
		this.activeConnections.delete(clientId);

		for (const [
			projectName,
			subscribers,
		] of this.projectSubscribers.entries()) {
			subscribers.delete(clientId);
			if (subscribers.size === 0) {
				this.projectSubscribers.delete(projectName);
			}
		}
	}

	handleIncomingMessage(clientId: string, rawMessage: string) {
		let message: { type?: string; project_name?: string };
		try {
			message = JSON.parse(rawMessage) as {
				type?: string;
				project_name?: string;
			};
		} catch {
			this.sendPersonalMessage(
				{
					type: 'error',
					status: 'invalid_json',
					timestamp: new Date().toISOString(),
				},
				clientId,
			);
			return;
		}

		if (message.type === 'subscribe_project' && message.project_name) {
			this.subscribeToProject(clientId, message.project_name);
			this.sendPersonalMessage(
				{
					type: 'subscription_confirmed',
					project_name: message.project_name,
					status: 'subscribed',
				},
				clientId,
			);
			return;
		}

		if (message.type === 'unsubscribe_project' && message.project_name) {
			this.unsubscribeFromProject(clientId, message.project_name);
			this.sendPersonalMessage(
				{
					type: 'unsubscription_confirmed',
					project_name: message.project_name,
					status: 'unsubscribed',
				},
				clientId,
			);
			return;
		}

		if (message.type === 'ping') {
			this.sendPersonalMessage(
				{
					type: 'pong',
					timestamp: new Date().toISOString(),
				},
				clientId,
			);
		}
	}

	sendPersonalMessage(message: Record<string, unknown>, clientId: string) {
		const socket = this.activeConnections.get(clientId);
		if (!socket || socket.readyState !== 1) {
			this.disconnect(clientId);
			return;
		}

		try {
			socket.send(JSON.stringify(message));
		} catch {
			this.disconnect(clientId);
		}
	}

	broadcast(message: Record<string, unknown>) {
		for (const clientId of this.activeConnections.keys()) {
			this.sendPersonalMessage(message, clientId);
		}
	}

	sendProjectUpdate(projectName: string, updateData: Record<string, unknown>) {
		const subscribers = this.projectSubscribers.get(projectName);
		if (!subscribers || subscribers.size === 0) {
			return;
		}

		const message = {
			type: 'project_update',
			project_name: projectName,
			data: updateData,
			timestamp: new Date().toISOString(),
		};

		for (const clientId of subscribers) {
			this.sendPersonalMessage(message, clientId);
		}
	}

	private subscribeToProject(clientId: string, projectName: string) {
		if (!this.projectSubscribers.has(projectName)) {
			this.projectSubscribers.set(projectName, new Set());
		}
		this.projectSubscribers.get(projectName)?.add(clientId);
	}

	private unsubscribeFromProject(clientId: string, projectName: string) {
		const subscribers = this.projectSubscribers.get(projectName);
		if (!subscribers) {
			return;
		}

		subscribers.delete(clientId);
		if (subscribers.size === 0) {
			this.projectSubscribers.delete(projectName);
		}
	}
}
