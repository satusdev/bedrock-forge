import React from 'react';
import Label from './Label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './Select';

interface LabeledSelectProps extends Omit<
	React.SelectHTMLAttributes<HTMLSelectElement>,
	'onChange'
> {
	label: string;
	required?: boolean;
	containerClassName?: string;
	placeholder?: string;
	options?: Array<{ label: string; value: string }>;
	onChange?: (event: { target: { value: string } }) => void;
}

const LabeledSelect: React.FC<LabeledSelectProps> = ({
	label,
	required = false,
	containerClassName,
	className,
	id,
	children,
	value,
	defaultValue,
	placeholder,
	disabled,
	name,
	options,
	onChange,
}) => {
	const selectId = id || name;
	const resolvedValue =
		typeof value === 'string'
			? value
			: typeof defaultValue === 'string'
				? defaultValue
				: undefined;

	const mappedOptions = React.useMemo(() => {
		if (options?.length) {
			return options;
		}

		if (!children) {
			return [] as Array<{ label: string; value: string }>;
		}

		return React.Children.toArray(children)
			.filter(React.isValidElement)
			.map(child => {
				const childProps = child.props as {
					value?: string;
					children?: React.ReactNode;
				};
				return {
					value: String(childProps.value ?? ''),
					label:
						typeof childProps.children === 'string'
							? childProps.children
							: String(childProps.value ?? ''),
				};
			})
			.filter(option => option.value.length > 0);
	}, [children, options]);

	return (
		<div className={containerClassName}>
			<Label htmlFor={selectId} required={required} className='mb-1 block'>
				{label}
			</Label>
			<Select
				value={resolvedValue}
				onValueChange={nextValue =>
					onChange?.({ target: { value: nextValue } })
				}
				disabled={disabled}
				name={name}
			>
				<SelectTrigger id={selectId} className={className}>
					<SelectValue placeholder={placeholder ?? 'Select an option'} />
				</SelectTrigger>
				<SelectContent>
					{mappedOptions.map(option => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
};

export default LabeledSelect;
