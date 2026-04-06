import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface StepperProps {
	steps: { label: string; description?: string }[];
	currentStep: number; // 0-indexed
	className?: string;
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
	return (
		<div className={cn('flex items-start w-full', className)}>
			{steps.map((step, idx) => {
				const isCompleted = idx < currentStep;
				const isActive = idx === currentStep;

				return (
					<div key={idx} className='flex items-start flex-1'>
						{/* Step indicator + label */}
						<div className='flex flex-col items-center'>
							<div
								className={cn(
									'flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-semibold shrink-0 transition-colors',
									isCompleted &&
										'bg-primary border-primary text-primary-foreground',
									isActive && 'bg-background border-primary text-primary',
									!isCompleted &&
										!isActive &&
										'bg-background border-muted-foreground/30 text-muted-foreground',
								)}
							>
								{isCompleted ? (
									<Check className='h-4 w-4' />
								) : (
									<span>{idx + 1}</span>
								)}
							</div>
							<div className='mt-1.5 text-center'>
								<p
									className={cn(
										'text-xs font-medium leading-tight',
										isActive
											? 'text-foreground'
											: isCompleted
												? 'text-muted-foreground'
												: 'text-muted-foreground/60',
									)}
								>
									{step.label}
								</p>
								{step.description && (
									<p className='text-xs text-muted-foreground/50 mt-0.5 leading-tight hidden sm:block'>
										{step.description}
									</p>
								)}
							</div>
						</div>

						{/* Connector line (not after last step) */}
						{idx < steps.length - 1 && (
							<div
								className={cn(
									'flex-1 h-0.5 mt-4 mx-1',
									idx < currentStep ? 'bg-primary' : 'bg-muted',
								)}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
