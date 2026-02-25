import {
	Link as TanStackLink,
	Navigate as TanStackNavigate,
	useNavigate as useTanStackNavigate,
	useRouterState,
} from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

type NavigateOptions = {
	replace?: boolean;
	state?: unknown;
};

export const Link = TanStackLink;
export const Navigate = TanStackNavigate;

export const useLocation = () => {
	return useRouterState({
		select: state => state.location,
	}) as unknown as {
		pathname: string;
		search: string;
		hash: string;
		state?: unknown;
	};
};

export const useParams = <T extends Record<string, string | undefined>>() => {
	const matches = useRouterState({ select: state => state.matches });
	const params = matches[matches.length - 1]?.params ?? {};
	return params as T;
};

export const useNavigate = () => {
	const navigate = useTanStackNavigate();

	return useCallback(
		(to: string | number, options?: NavigateOptions) => {
			if (typeof to === 'number') {
				window.history.go(to);
				return;
			}

			navigate({
				to,
				replace: options?.replace,
				state: options?.state,
			});
		},
		[navigate],
	);
};

export const useSearchParams = (): [
	URLSearchParams,
	(
		nextInit:
			| URLSearchParams
			| string
			| Record<string, string>
			| [string, string][]
			| ((prev: URLSearchParams) => URLSearchParams),
		options?: { replace?: boolean },
	) => void,
] => {
	const navigate = useTanStackNavigate();
	const location = useLocation();

	const searchParams = useMemo(() => {
		const searchValue =
			typeof location.search === 'string'
				? location.search
				: location.search == null
					? ''
					: String(location.search);
		const rawSearch = searchValue.startsWith('?')
			? searchValue.slice(1)
			: searchValue;
		return new URLSearchParams(rawSearch);
	}, [location.search]);

	const setSearchParams = useCallback(
		(
			nextInit:
				| URLSearchParams
				| string
				| Record<string, string>
				| [string, string][]
				| ((prev: URLSearchParams) => URLSearchParams),
			options?: { replace?: boolean },
		) => {
			const currentParams = new URLSearchParams(searchParams);
			const resolved =
				typeof nextInit === 'function' ? nextInit(currentParams) : nextInit;

			const nextParams = new URLSearchParams(resolved as any);
			const nextSearch = Object.fromEntries(nextParams.entries());

			navigate({
				to: location.pathname,
				search: () => nextSearch,
				replace: options?.replace,
				state: location.state,
				hash: location.hash,
			} as any);
		},
		[searchParams, navigate, location.pathname, location.state, location.hash],
	);

	return [searchParams, setSearchParams];
};
