import React from 'react';

interface LabeledSelectProps
	extends React.SelectHTMLAttributes<HTMLSelectElement> {
	label: string;
	required?: boolean;
	containerClassName?: string;
}

const LabeledSelect: React.FC<LabeledSelectProps> = ({
	label,
	required = false,
	containerClassName,
	className,
	id,
	children,
	...props
}) => {
	const selectId = id || props.name;

	return (
		<div className={containerClassName}>
			<label
				htmlFor={selectId}
				className='block text-sm font-medium text-gray-700 mb-1'
			>
				{label}
				{required ? ' *' : ''}
			</label>
			<select
				id={selectId}
				className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
					className || ''
				}`}
				{...props}
			>
				{children}
			</select>
		</div>
	);
};

export default LabeledSelect;
