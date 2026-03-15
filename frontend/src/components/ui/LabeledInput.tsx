import React from 'react';
import Input from './Input';
import Label from './Label';

interface LabeledInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
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
			<Label htmlFor={inputId} required={required} className='mb-1 block'>
				{label}
			</Label>
			<Input id={inputId} className={className} {...props} />
		</div>
	);
};

export default LabeledInput;
