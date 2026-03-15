import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { router } from './router/index.tsx';
import './index.css';

// Create a client for React Query
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<ThemeProvider defaultTheme='light'>
				<RouterProvider router={router} />
				<Toaster
					position='top-right'
					toastOptions={{
						duration: 4000,
						style: {
							background: '#363636',
							color: '#fff',
						},
					}}
				/>
			</ThemeProvider>
		</QueryClientProvider>
	</React.StrictMode>,
);
