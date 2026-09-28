import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger, WorkbenchButton } from '../../../design'
import { cn } from '../../../utils/cn'

type CanvasNavigationTooltipButtonProps = Omit<
  React.ComponentProps<typeof WorkbenchButton>,
  'aria-label' | 'title'
> & {
  label: string
  tooltip?: string
}

export function CanvasNavigationTooltipButton({
  label,
  tooltip = label,
  children,
  disabled,
  className,
  onClick,
  ...buttonProps
}: CanvasNavigationTooltipButtonProps): JSX.Element {
  const handleClick = React.useCallback<React.MouseEventHandler<HTMLButtonElement>>((event) => {
    if (disabled) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onClick?.(event)
  }, [disabled, onClick])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <WorkbenchButton
            {...buttonProps}
            className={cn(className, disabled && 'cursor-not-allowed opacity-50')}
            aria-label={label}
            aria-disabled={disabled || undefined}
            onClick={handleClick}
          >
            {children}
          </WorkbenchButton>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  )
}
