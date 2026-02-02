import { useState } from 'react';
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

	const { data: projectsData, refetch: refetchProjects } = useQuery({
		queryKey: ['client-projects'],
		queryFn: clientPortalApi.getProjects,
		enabled: Boolean(activeToken),
	});

	const { data: invoicesData, refetch: refetchInvoices } = useQuery({
		queryKey: ['client-invoices'],
		queryFn: clientPortalApi.getInvoices,
		enabled: Boolean(activeToken),
	});

	const { data: ticketsData, refetch: refetchTickets } = useQuery({
		queryKey: ['client-tickets'],
		queryFn: clientPortalApi.getTickets,
		enabled: Boolean(activeToken),
	});

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
		refetchTickets();
	};

	const projects = projectsData?.data || [];
	const invoices = invoicesData?.data || [];
	const tickets = ticketsData?.data || [];

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
						<h2 className='text-lg font-semibold text-gray-900'>Invoices</h2>
						<div className='mt-3 space-y-2'>
							{invoices.length === 0 ? (
								<p className='text-sm text-gray-500'>No invoices available.</p>
							) : (
								invoices.map((invoice: any) => (
									<div
										key={invoice.id}
										className='flex justify-between text-sm'
									>
										<span>{invoice.invoice_number}</span>
										<Badge variant='secondary'>{invoice.status}</Badge>
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
									<div key={ticket.id} className='flex justify-between text-sm'>
										<span>{ticket.subject}</span>
										<Badge variant='secondary'>{ticket.status}</Badge>
									</div>
								))
							)}
						</div>
					</Card>
				</div>
			</div>
		</div>
	);
}
