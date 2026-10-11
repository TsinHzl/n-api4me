/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Combobox as ComboboxPrimitive } from '@base-ui/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

export interface AsyncComboboxOption {
  value: string
  label: string
  description?: string
}

interface AsyncComboboxProps {
  options: readonly AsyncComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  ariaLabel: string
  placeholder?: string
  emptyText?: string
  loading?: boolean
  disabled?: boolean
  className?: string
  popupClassName?: string
  /** When provided, options are owned by the caller and typed input is
   * forwarded here instead of filtering the list locally. */
  onSearch?: (query: string) => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
}

/**
 * Select-only combobox for filters whose options are loaded over the network.
 * Mirrors the group filter's interaction while leaving the option list (and any
 * server-side search) to the caller. Typing never commits a value that is not
 * in the list.
 */
export function AsyncCombobox(props: AsyncComboboxProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const anchor = useComboboxAnchor()
  // A value restored from the URL may no longer be in the option list; keeping
  // a synthetic entry lets the input show it and keeps the clear button usable.
  const selected = React.useMemo(() => {
    if (!props.value) return null
    return (
      props.options.find((option) => option.value === props.value) ?? {
        value: props.value,
        label: props.value,
      }
    )
  }, [props.options, props.value])
  const displayedValue = selected?.label ?? ''

  return (
    <ComboboxPrimitive.Root
      items={props.options}
      value={selected ?? null}
      disabled={props.disabled}
      open={open}
      inputValue={open ? search : displayedValue}
      filter={props.onSearch ? null : undefined}
      isItemEqualToValue={(item, value) => item.value === value.value}
      onInputValueChange={(nextValue, details) => {
        if (details.reason !== 'input-change') return
        setSearch(nextValue)
        props.onSearch?.(nextValue)
      }}
      onOpenChange={(nextOpen, details) => {
        setOpen(nextOpen)
        if (details.reason !== 'input-change') setSearch('')
      }}
      onValueChange={(option) => {
        props.onValueChange(option ? option.value : '')
      }}
    >
      <div ref={anchor} className={cn('min-w-0', props.className)}>
        <ComboboxInput
          aria-label={props.ariaLabel}
          disabled={props.disabled}
          showClear
          placeholder={props.placeholder ?? props.ariaLabel}
          triggerAriaLabel={props.ariaLabel}
          onKeyDown={props.onKeyDown}
          onFocus={() => setOpen(true)}
          className='h-full min-h-8 w-full'
        />
      </div>
      <ComboboxContent anchor={anchor} className={props.popupClassName}>
        <ComboboxEmpty>
          {props.loading
            ? t('Loading...')
            : (props.emptyText ?? t('No results found'))}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: AsyncComboboxOption) => (
            <ComboboxItem key={option.value} value={option}>
              <span className='min-w-0 break-words'>
                {option.label}
                {option.description && (
                  <span className='text-muted-foreground block text-xs break-all'>
                    {option.description}
                  </span>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </ComboboxPrimitive.Root>
  )
}
