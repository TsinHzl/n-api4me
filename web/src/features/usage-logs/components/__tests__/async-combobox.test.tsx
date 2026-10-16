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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { AsyncCombobox } from '../async-combobox'

const pointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'setPointerCapture'
)

const options = [
  { value: 'gpt-4o', label: 'gpt-4o' },
  { value: 'claude-sonnet-5', label: 'claude-sonnet-5' },
]

function renderCombobox(
  props: Partial<React.ComponentProps<typeof AsyncCombobox>> = {}
) {
  const onValueChange = vi.fn()
  render(
    <AsyncCombobox
      options={options}
      value=''
      onValueChange={onValueChange}
      ariaLabel='Model Name'
      {...props}
    />
  )
  return { onValueChange }
}

afterEach(() => {
  vi.restoreAllMocks()
  if (pointerCaptureDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'setPointerCapture',
      pointerCaptureDescriptor
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
  }
})

it('opens the list on focus and shows the available options', async () => {
  renderCombobox()
  const input = screen.getByRole('combobox', { name: 'Model Name' })
  await userEvent.click(input)
  expect(await screen.findByRole('option', { name: 'gpt-4o' })).toBeVisible()
  expect(
    screen.getByRole('option', { name: 'claude-sonnet-5' })
  ).toBeVisible()
})

it('commits the chosen option to the caller', async () => {
  const { onValueChange } = renderCombobox()
  const input = screen.getByRole('combobox', { name: 'Model Name' })
  await userEvent.click(input)
  await userEvent.click(await screen.findByRole('option', { name: 'gpt-4o' }))
  expect(onValueChange).toHaveBeenCalledWith('gpt-4o')
})

it('clears the current selection instead of keeping a stale value', async () => {
  const { onValueChange } = renderCombobox({
    options: [],
    value: 'retired-model',
  })
  const input = screen.getByRole('combobox', { name: 'Model Name' })
  expect(input).toHaveValue('retired-model')
  await userEvent.click(input)
  // Base UI 给清空按钮设 tabIndex=-1（避免抢走输入框焦点），故查询需含 hidden。
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear', hidden: true })
  )
  expect(onValueChange).toHaveBeenCalledWith('')
})

it('forwards typed input to onSearch without filtering locally', async () => {
  const onSearch = vi.fn()
  renderCombobox({ onSearch })
  const input = screen.getByRole('combobox', { name: 'Model Name' })
  await userEvent.click(input)
  await userEvent.type(input, 'son')
  // 输入防抖：停顿后仅发出最后一次关键词。
  await waitFor(() => expect(onSearch).toHaveBeenCalledWith('son'))
  expect(onSearch).toHaveBeenCalledTimes(1)
})

it('shows the error message with retry when data loading fails', async () => {
  const onErrorRetry = vi.fn()
  renderCombobox({ options: [], errorText: 'Failed to load', onErrorRetry })
  const input = screen.getByRole('combobox', { name: 'Model Name' })
  await userEvent.click(input)
  const retry = await screen.findByRole('button', { name: 'Failed to load' })
  await userEvent.click(retry)
  expect(onErrorRetry).toHaveBeenCalledTimes(1)
})

it('filters typed input locally when no onSearch is provided', async () => {
  renderCombobox()
  const input = screen.getByRole('combobox', { name: 'Model Name' })
  await userEvent.click(input)
  await userEvent.type(input, 'claude')
  expect(await screen.findByRole('option', { name: 'claude-sonnet-5' })).toBeVisible()
  expect(
    screen.queryByRole('option', { name: 'gpt-4o' })
  ).not.toBeInTheDocument()
})

it('shows the loading message while options are being fetched', async () => {
  renderCombobox({ options: [], loading: true })
  const input = screen.getByRole('combobox', { name: 'Model Name' })
  await userEvent.click(input)
  expect(await screen.findByText('Loading...')).toBeVisible()
})
