import React from 'react';
import Card from './Card';
import { cn } from '@/lib/utils';

type SummaryIcon = React.ComponentType<{ className?: string }>;

interface SummaryCardProps {
	title: string;
	value: React.ReactNode;
	icon: SummaryIcon;
	iconPosition?: 'left' | 'right';
	iconClassName?: string;
	iconContainerClassName?: string;
	titleClassName?: string;
	valueClassName?: string;
	containerClassName?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
	title,
	value,
	icon,
	iconPosition = 'left',
	iconClassName,
	iconContainerClassName,
	titleClassName,
	valueClassName,
	containerClassName,
}) => {
	const Icon = icon;
	const isRight = iconPosition === 'right';
	const defaultContainerClassName = isRight
		? 'p-4 flex items-center justify-between'
		: 'flex items-center';
	const defaultTitleClassName =
		'text-sm font-medium text-gray-500 dark:text-gray-400';
	const defaultValueClassName =
		'text-2xl font-bold text-gray-900 dark:text-white';
	const iconWrapperClassName =
		iconContainerClassName ||
		'rounded-lg bg-gray-100 p-3 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

	return (
		<Card>
			<div className={cn(defaultContainerClassName, containerClassName)}>
				{!isRight && (
					<div className={iconWrapperClassName}>
						<Icon className={cn('h-6 w-6', iconClassName)} />
					</div>
				)}
				<div className={isRight ? '' : 'ml-4'}>
					<p className={titleClassName || defaultTitleClassName}>{title}</p>
					<p className={valueClassName || defaultValueClassName}>{value}</p>
				</div>
				{isRight && (
					<div className={iconWrapperClassName}>
						<Icon className={cn('h-6 w-6', iconClassName)} />
					</div>
				)}
			</div>
		</Card>
	);
};

export default SummaryCard;
