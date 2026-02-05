import React from 'react';

interface LabeledTextareaProps
	extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
	label: string;
	required?: boolean;
	containerClassName?: string;
}

const LabeledTextarea: React.FC<LabeledTextareaProps> = ({
	label,
	required = false,
	containerClassName,
	className,
	id,
	...props
}) => {
	const textareaId = id || props.name;

	return (
		<div className={containerClassName}>
			<label
				htmlFor={textareaId}
				className='block text-sm font-medium text-gray-700 mb-1'
			>
				{label}
				{required ? ' *' : ''}
			</label>
			<textarea
				id={textareaId}
				className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
					className || ''
				}`}
				{...props}
			/>
		</div>
	);
};

export default LabeledTextarea;
