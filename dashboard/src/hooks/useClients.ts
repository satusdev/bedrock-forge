import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '@/services/api';
import type {
	ClientCreateInput,
	ClientDetail,
	ClientListItem,
	ClientUpdateInput,
	ClientsListResponse,
} from '@/types';

export type TagOption = {
	id: number;
	name: string;
	color: string;
};

export const useClientsList = () =>
	useQuery({
		queryKey: ['clients'],
		queryFn: dashboardApi.getClients,
		select: data => (data?.data?.clients || []) as ClientListItem[],
	});

export const useClient = (clientId: number | null, enabled: boolean) =>
	useQuery({
		queryKey: ['client', clientId],
		queryFn: () => dashboardApi.getClient(Number(clientId)),
		enabled: enabled && !!clientId,
		select: data => data?.data as ClientDetail,
	});

export const useTags = () =>
	useQuery({
		queryKey: ['tags'],
		queryFn: () => dashboardApi.getTags(),
		select: data => (data?.data || []) as TagOption[],
	});

export const useClientTags = (clientId: number | null, enabled: boolean) =>
	useQuery({
		queryKey: ['client-tags', clientId],
		queryFn: () => dashboardApi.getClientTags(Number(clientId)),
		enabled: enabled && !!clientId,
		select: data => (data?.data || []) as TagOption[],
	});

export const useCreateClient = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ClientCreateInput) =>
			dashboardApi.createClient(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['clients'] });
		},
	});
};

export const useUpdateClient = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: {
			clientId: number;
			clientData: ClientUpdateInput;
		}) => dashboardApi.updateClient(payload.clientId, payload.clientData),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['clients'] });
			queryClient.invalidateQueries({
				queryKey: ['client', variables.clientId],
			});
		},
	});
};

export const useDeleteClient = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (clientId: number) => dashboardApi.deleteClient(clientId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['clients'] });
		},
	});
};

export const useSetClientTags = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: { clientId: number; tagIds: number[] }) =>
			dashboardApi.setClientTags(payload.clientId, payload.tagIds),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ['client-tags', variables.clientId],
			});
		},
	});
};
