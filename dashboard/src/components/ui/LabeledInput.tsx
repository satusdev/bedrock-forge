import React from 'react';

interface LabeledInputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	label: string;
	required?: boolean;
	containerClassName?: string;
}

const LabeledInput: React.FC<LabeledInputProps> = ({
	label,
	required = false,
	containerClassName,
	className,
	id,
	...props
}) => {
	const inputId = id || props.name;

	return (
		<div className={containerClassName}>
			<label
				htmlFor={inputId}
				className='block text-sm font-medium text-gray-700 mb-1'
			>
				{label}
				{required ? ' *' : ''}
			</label>
			<input
				id={inputId}
				className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
					className || ''
				}`}
				{...props}
			/>
		</div>
	);
};

export default LabeledInput;
