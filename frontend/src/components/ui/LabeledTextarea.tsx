import React from 'react';
import Label from './Label';
import Textarea from './Textarea';

interface LabeledTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
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
			<Label htmlFor={textareaId} required={required} className='mb-1 block'>
				{label}
			</Label>
			<Textarea id={textareaId} className={className} {...props} />
		</div>
	);
};

export default LabeledTextarea;
