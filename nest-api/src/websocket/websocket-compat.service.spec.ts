import { WebsocketCompatService } from './websocket-compat.service';

type MockSocket = {
	readyState: 0 | 1 | 2 | 3;
	send: jest.Mock;
};

describe('WebsocketCompatService', () => {
	let service: WebsocketCompatService;

	beforeEach(() => {
		service = new WebsocketCompatService();
	});

	it('sends initial connection payload', () => {
		const socket: MockSocket = {
			readyState: 1,
			send: jest.fn(),
		};

		service.connect('client-1', socket);

		expect(socket.send).toHaveBeenCalled();
		expect(socket.send.mock.calls[0][0]).toContain('"type":"connection"');
	});

	it('handles subscribe/unsubscribe and ping messages', () => {
		const socket: MockSocket = {
			readyState: 1,
			send: jest.fn(),
		};

		service.connect('client-1', socket);
		service.handleIncomingMessage(
			'client-1',
			JSON.stringify({ type: 'subscribe_project', project_name: 'Acme' }),
		);
		service.handleIncomingMessage('client-1', JSON.stringify({ type: 'ping' }));
		service.handleIncomingMessage(
			'client-1',
			JSON.stringify({ type: 'unsubscribe_project', project_name: 'Acme' }),
		);

		const sent = socket.send.mock.calls.map(call => String(call[0])).join(' ');
		expect(sent).toContain('subscription_confirmed');
		expect(sent).toContain('pong');
		expect(sent).toContain('unsubscription_confirmed');
	});

	it('broadcasts project updates only to subscribers', () => {
		const socketA: MockSocket = {
			readyState: 1,
			send: jest.fn(),
		};
		const socketB: MockSocket = {
			readyState: 1,
			send: jest.fn(),
		};

		service.connect('client-a', socketA);
		service.connect('client-b', socketB);

		service.handleIncomingMessage(
			'client-a',
			JSON.stringify({ type: 'subscribe_project', project_name: 'Acme' }),
		);
		service.sendProjectUpdate('Acme', { changed: true });

		const sentA = socketA.send.mock.calls
			.map(call => String(call[0]))
			.join(' ');
		const sentB = socketB.send.mock.calls
			.map(call => String(call[0]))
			.join(' ');
		expect(sentA).toContain('project_update');
		expect(sentB).not.toContain('project_update');
	});

	it('returns error payload for invalid JSON', () => {
		const socket: MockSocket = {
			readyState: 1,
			send: jest.fn(),
		};

		service.connect('client-1', socket);
		service.handleIncomingMessage('client-1', 'not-json');

		const sent = socket.send.mock.calls.map(call => String(call[0])).join(' ');
		expect(sent).toContain('invalid_json');
	});
});
