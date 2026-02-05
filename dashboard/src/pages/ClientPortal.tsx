import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientPortalApi } from '@/services/clientPortalApi';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import toast from 'react-hot-toast';

export default function ClientPortal() {
	const [token, setToken] = useState(
		localStorage.getItem('client_token') || ''
	);
	const [activeToken, setActiveToken] = useState(
		localStorage.getItem('client_token') || ''
	);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [isLoggingIn, setIsLoggingIn] = useState(false);
	const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
	const [replyMessage, setReplyMessage] = useState('');
	const [newTicketSubject, setNewTicketSubject] = useState('');
	const [newTicketMessage, setNewTicketMessage] = useState('');
	const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
	const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
		null
	);

	const { data: projectsData, refetch: refetchProjects } = useQuery({
		queryKey: ['client-projects'],
		queryFn: clientPortalApi.getProjects,
		enabled: Boolean(activeToken),
	});

	const { data: profileData } = useQuery({
		queryKey: ['client-profile'],
		queryFn: clientPortalApi.getProfile,
		enabled: Boolean(activeToken),
	});

	useEffect(() => {
		const refresh = async () => {
			if (!activeToken) return;
			try {
				const response = await clientPortalApi.refreshToken();
				const accessToken = response.data?.access_token;
				if (accessToken) {
					localStorage.setItem('client_token', accessToken);
					setToken(accessToken);
					setActiveToken(accessToken);
				}
			} catch {
				// Ignore refresh failures
			}
		};
		refresh();
	}, [activeToken]);

	const { data: invoicesData, refetch: refetchInvoices } = useQuery({
		queryKey: ['client-invoices'],
		queryFn: clientPortalApi.getInvoices,
		enabled: Boolean(activeToken),
	});

	const { data: subscriptionsData, refetch: refetchSubscriptions } = useQuery({
		queryKey: ['client-subscriptions'],
		queryFn: clientPortalApi.getSubscriptions,
		enabled: Boolean(activeToken),
	});

	const { data: backupsData, refetch: refetchBackups } = useQuery({
		queryKey: ['client-backups'],
		queryFn: clientPortalApi.getBackups,
		enabled: Boolean(activeToken),
	});

	const { data: ticketsData, refetch: refetchTickets } = useQuery({
		queryKey: ['client-tickets'],
		queryFn: clientPortalApi.getTickets,
		enabled: Boolean(activeToken),
	});

	const { data: ticketDetailData, refetch: refetchTicketDetail } = useQuery({
		queryKey: ['client-ticket', selectedTicketId],
		queryFn: () => clientPortalApi.getTicket(Number(selectedTicketId)),
		enabled: Boolean(activeToken && selectedTicketId),
	});

	const { data: invoiceDetailData, refetch: refetchInvoiceDetail } = useQuery({
		queryKey: ['client-invoice', selectedInvoiceId],
		queryFn: () => clientPortalApi.getInvoice(Number(selectedInvoiceId)),
		enabled: Boolean(activeToken && selectedInvoiceId),
	});

	const handleLogin = async () => {
		if (!email.trim() || !password.trim()) {
			toast.error('Enter email and password');
			return;
		}
		setIsLoggingIn(true);
		try {
			const response = await clientPortalApi.login({
				email: email.trim(),
				password: password.trim(),
			});
			const accessToken = response.data?.access_token;
			if (!accessToken) {
				throw new Error('Invalid login response');
			}
			localStorage.setItem('client_token', accessToken);
			setToken(accessToken);
			setActiveToken(accessToken);
			toast.success('Logged in successfully');
			refetchProjects();
			refetchInvoices();
			refetchSubscriptions();
			refetchBackups();
			refetchTickets();
		} catch (error: any) {
			toast.error(error?.response?.data?.detail || 'Login failed');
		} finally {
			setIsLoggingIn(false);
		}
	};

	const handleSaveToken = () => {
		if (!token.trim()) {
			toast.error('Please enter a client token');
			return;
		}
		localStorage.setItem('client_token', token.trim());
		setActiveToken(token.trim());
		toast.success('Client token saved');
		refetchProjects();
		refetchInvoices();
		refetchSubscriptions();
		refetchBackups();
		refetchTickets();
	};

	const handleCreateTicket = async () => {
		if (!newTicketSubject.trim() || !newTicketMessage.trim()) {
			toast.error('Enter a subject and message');
			return;
		}
		setIsSubmittingTicket(true);
		try {
			await clientPortalApi.createTicket({
				subject: newTicketSubject.trim(),
				message: newTicketMessage.trim(),
			});
			setNewTicketSubject('');
			setNewTicketMessage('');
			toast.success('Ticket created');
			refetchTickets();
		} catch (error: any) {
			toast.error(error?.response?.data?.detail || 'Failed to create ticket');
		} finally {
			setIsSubmittingTicket(false);
		}
	};

	const handleReply = async () => {
		if (!selectedTicketId || !replyMessage.trim()) {
			toast.error('Enter a reply message');
			return;
		}
		setIsSubmittingTicket(true);
		try {
			await clientPortalApi.replyToTicket(
				selectedTicketId,
				replyMessage.trim()
			);
			setReplyMessage('');
			toast.success('Reply sent');
			refetchTicketDetail();
			refetchTickets();
		} catch (error: any) {
			toast.error(error?.response?.data?.detail || 'Failed to send reply');
		} finally {
			setIsSubmittingTicket(false);
		}
	};

	const projects = projectsData?.data || [];
	const invoices = invoicesData?.data || [];
	const subscriptions = subscriptionsData?.data || [];
	const backups = backupsData?.data || [];
	const tickets = ticketsData?.data || [];
	const ticketDetail = ticketDetailData?.data;
	const invoiceDetail = invoiceDetailData?.data;
	const clientRole = profileData?.data?.role || 'member';
	const isViewer = clientRole === 'viewer';

	return (
		<div className='min-h-screen bg-gray-50 py-8'>
			<div className='max-w-6xl mx-auto px-4 space-y-6'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Client Portal</h1>
					<p className='mt-1 text-sm text-gray-500'>
						View your sites, invoices, and support tickets.
					</p>
				</div>

				<Card>
					<div className='space-y-3'>
						<div>
							<label className='text-sm font-medium text-gray-700'>Email</label>
							<input
								value={email}
								onChange={e => setEmail(e.target.value)}
								type='email'
								className='mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
								placeholder='you@example.com'
							/>
						</div>
						<div>
							<label className='text-sm font-medium text-gray-700'>
								Password
							</label>
							<input
								value={password}
								onChange={e => setPassword(e.target.value)}
								type='password'
								className='mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
								placeholder='••••••••'
							/>
						</div>
						<Button
							variant='primary'
							onClick={handleLogin}
							disabled={isLoggingIn}
						>
							{isLoggingIn ? 'Signing in...' : 'Sign in'}
						</Button>
						{activeToken && (
							<p className='text-xs text-gray-500'>
								Role: <span className='font-medium'>{clientRole}</span>
							</p>
						)}
						<div className='border-t border-gray-200 pt-3'>
							<label className='text-sm font-medium text-gray-700'>
								Client Access Token
							</label>
							<div className='flex gap-3'>
								<input
									value={token}
									onChange={e => setToken(e.target.value)}
									className='flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm'
									placeholder='Paste your client token'
								/>
								<Button variant='primary' onClick={handleSaveToken}>
									Save Token
								</Button>
							</div>
						</div>
					</div>
				</Card>

				<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
					<Card>
						<h2 className='text-lg font-semibold text-gray-900'>Sites</h2>
						<div className='mt-3 space-y-2'>
							{projects.length === 0 ? (
								<p className='text-sm text-gray-500'>No projects available.</p>
							) : (
								projects.map((project: any) => (
									<div
										key={project.id}
										className='flex justify-between text-sm'
									>
										<span>{project.name}</span>
										<Badge variant='secondary'>{project.status}</Badge>
									</div>
								))
							)}
						</div>
					</Card>

					<Card>
						<h2 className='text-lg font-semibold text-gray-900'>
							Subscriptions
						</h2>
						<div className='mt-3 space-y-2'>
							{subscriptions.length === 0 ? (
								<p className='text-sm text-gray-500'>
									No subscriptions available.
								</p>
							) : (
								subscriptions.map((sub: any) => (
									<div key={sub.id} className='text-sm space-y-1'>
										<div className='flex justify-between'>
											<span>{sub.name}</span>
											<Badge variant='secondary'>{sub.status}</Badge>
										</div>
										<div className='text-xs text-gray-500'>
											{sub.subscription_type} • {sub.amount} {sub.currency}
										</div>
									</div>
								))
							)}
						</div>
					</Card>

					<Card>
						<h2 className='text-lg font-semibold text-gray-900'>Invoices</h2>
						<div className='mt-3 space-y-2'>
							{invoices.length === 0 ? (
								<p className='text-sm text-gray-500'>No invoices available.</p>
							) : (
								invoices.map((invoice: any) => (
									<button
										key={invoice.id}
										className='w-full text-left text-sm rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50'
										onClick={() => setSelectedInvoiceId(invoice.id)}
									>
										<div className='flex justify-between'>
											<span>{invoice.invoice_number}</span>
											<Badge variant='secondary'>{invoice.status}</Badge>
										</div>
									</button>
								))
							)}
						</div>
					</Card>

					<Card>
						<h2 className='text-lg font-semibold text-gray-900'>Backups</h2>
						<div className='mt-3 space-y-2'>
							{backups.length === 0 ? (
								<p className='text-sm text-gray-500'>No backups available.</p>
							) : (
								backups.map((backup: any) => (
									<div key={backup.id} className='text-sm space-y-1'>
										<div className='flex justify-between'>
											<span>{backup.project_name}</span>
											<Badge variant='secondary'>{backup.status}</Badge>
										</div>
										<div className='text-xs text-gray-500'>
											{backup.backup_type} • {backup.storage_type}
										</div>
									</div>
								))
							)}
						</div>
					</Card>

					<Card>
						<h2 className='text-lg font-semibold text-gray-900'>Tickets</h2>
						<div className='mt-3 space-y-2'>
							{tickets.length === 0 ? (
								<p className='text-sm text-gray-500'>No tickets available.</p>
							) : (
								tickets.map((ticket: any) => (
									<button
										key={ticket.id}
										className='w-full text-left text-sm rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50'
										onClick={() => setSelectedTicketId(ticket.id)}
									>
										<div className='flex justify-between'>
											<span>{ticket.subject}</span>
											<Badge variant='secondary'>{ticket.status}</Badge>
										</div>
										<div className='text-xs text-gray-500'>
											Priority: {ticket.priority}
										</div>
									</button>
								))
							)}
						</div>
					</Card>
				</div>

				<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
					<Card>
						<h2 className='text-lg font-semibold text-gray-900'>New Ticket</h2>
						<div className='mt-3 space-y-3'>
							<div>
								<label className='text-sm font-medium text-gray-700'>
									Subject
								</label>
								<input
									value={newTicketSubject}
									onChange={e => setNewTicketSubject(e.target.value)}
									className='mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
									placeholder='What do you need help with?'
								/>
							</div>
							<div>
								<label className='text-sm font-medium text-gray-700'>
									Message
								</label>
								<textarea
									value={newTicketMessage}
									onChange={e => setNewTicketMessage(e.target.value)}
									className='mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[120px]'
									placeholder='Describe the issue or request'
								/>
							</div>
							<Button
								variant='primary'
								onClick={handleCreateTicket}
								disabled={isSubmittingTicket || isViewer}
							>
								{isSubmittingTicket ? 'Submitting...' : 'Create Ticket'}
							</Button>
							{isViewer && (
								<p className='text-xs text-gray-500'>
									View-only role cannot create tickets.
								</p>
							)}
						</div>
					</Card>

					<Card>
						<h2 className='text-lg font-semibold text-gray-900'>
							Ticket Details
						</h2>
						<div className='mt-3 space-y-3'>
							{!selectedTicketId ? (
								<p className='text-sm text-gray-500'>
									Select a ticket to view details.
								</p>
							) : !ticketDetail ? (
								<p className='text-sm text-gray-500'>Loading ticket...</p>
							) : (
								<div className='space-y-4'>
									<div>
										<div className='flex items-center justify-between'>
											<h3 className='text-base font-semibold text-gray-900'>
												{ticketDetail.subject}
											</h3>
											<Badge variant='secondary'>{ticketDetail.status}</Badge>
										</div>
										<div className='text-xs text-gray-500'>
											Priority: {ticketDetail.priority}
										</div>
									</div>
									<div className='space-y-2'>
										{ticketDetail.messages?.length ? (
											ticketDetail.messages.map((message: any) => (
												<div
													key={message.id}
													className='border border-gray-200 rounded-lg px-3 py-2'
												>
													<div className='text-xs text-gray-500'>
														{message.sender_name || 'Support'} •{' '}
														{new Date(message.created_at).toLocaleString()}
													</div>
													<div className='text-sm text-gray-800 mt-1'>
														{message.message}
													</div>
												</div>
											))
										) : (
											<p className='text-sm text-gray-500'>No messages yet.</p>
										)}
									</div>
									<div>
										<label className='text-sm font-medium text-gray-700'>
											Reply
										</label>
										<textarea
											value={replyMessage}
											onChange={e => setReplyMessage(e.target.value)}
											className='mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[100px]'
											placeholder='Write a reply...'
										/>
										<Button
											variant='primary'
											onClick={handleReply}
											disabled={isSubmittingTicket || isViewer}
										>
											{isSubmittingTicket ? 'Sending...' : 'Send Reply'}
										</Button>
										{isViewer && (
											<p className='text-xs text-gray-500'>
												View-only role cannot reply to tickets.
											</p>
										)}
									</div>
								</div>
							)}
						</div>
					</Card>
				</div>

				<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
					<Card>
						<h2 className='text-lg font-semibold text-gray-900'>
							Invoice Details
						</h2>
						<div className='mt-3 space-y-3'>
							{!selectedInvoiceId ? (
								<p className='text-sm text-gray-500'>
									Select an invoice to view details.
								</p>
							) : !invoiceDetail ? (
								<p className='text-sm text-gray-500'>Loading invoice...</p>
							) : (
								<div className='space-y-4'>
									<div className='flex items-center justify-between'>
										<div>
											<div className='text-sm font-medium text-gray-900'>
												{invoiceDetail.invoice_number}
											</div>
											<div className='text-xs text-gray-500'>
												Due:{' '}
												{new Date(invoiceDetail.due_date).toLocaleDateString()}
											</div>
										</div>
										<Badge variant='secondary'>{invoiceDetail.status}</Badge>
									</div>
									<div className='text-sm text-gray-600'>
										Total: {invoiceDetail.total} {invoiceDetail.currency}
									</div>
									<div className='space-y-2'>
										{invoiceDetail.items?.length ? (
											invoiceDetail.items.map((item: any) => (
												<div
													key={item.id}
													className='border border-gray-200 rounded-lg px-3 py-2'
												>
													<div className='text-sm text-gray-900'>
														{item.description}
													</div>
													<div className='text-xs text-gray-500'>
														{item.quantity} × {item.unit_price} = {item.total}
													</div>
												</div>
											))
										) : (
											<p className='text-sm text-gray-500'>No line items.</p>
										)}
									</div>
								</div>
							)}
						</div>
					</Card>
				</div>
			</div>
		</div>
	);
}
