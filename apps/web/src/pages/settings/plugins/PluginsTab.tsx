import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomPluginsSettings } from '../CustomPluginsSettings';
import { InstalledPluginsInventory } from './components/InstalledPluginsInventory';

export function PluginsTab() {
	return (
		<Tabs defaultValue='catalog' className='space-y-4'>
			<TabsList className='grid w-full grid-cols-2'>
				<TabsTrigger value='catalog'>Custom Catalog</TabsTrigger>
				<TabsTrigger value='installed'>Installed Plugins</TabsTrigger>
			</TabsList>

			<TabsContent value='catalog'>
				<div className='border rounded-lg p-4 bg-card'>
					<CustomPluginsSettings />
				</div>
			</TabsContent>

			<TabsContent value='installed'>
				<InstalledPluginsInventory />
			</TabsContent>
		</Tabs>
	);
}
