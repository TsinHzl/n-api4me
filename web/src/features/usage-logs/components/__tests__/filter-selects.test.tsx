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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { CommonLogsFilterBar } from '../common-logs-filter-bar'
import { UsageLogsProvider } from '../usage-logs-provider'

const pointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'setPointerCapture'
)
const sensitiveSelector = '.\\[-webkit-text-security\\:disc\\]'

const ADMIN_USER = { id: 1, username: 'admin', role: 10 }

function FilterFixture() {
  const table = useReactTable({
    data: [],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <UsageLogsProvider>
      <CommonLogsFilterBar table={table} />
    </UsageLogsProvider>
  )
}

interface MockData {
  models?: string[]
  channels?: { id: number; name: string }[]
  users?: string[]
}

function mockApi(data: MockData = {}) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/group/') {
      return { data: { success: true, data: ['default'] } }
    }
    if (url === '/api/user/self/groups') {
      return { data: { success: true, data: { default: { desc: '', ratio: 1 } } } }
    }
    if (url === '/api/channel/models_enabled' || url === '/api/user/models') {
      return {
        data: {
          success: true,
          data: data.models ?? ['gpt-4o', 'claude-sonnet-5'],
        },
      }
    }
    if (url.startsWith('/api/channel/search')) {
      const items = (data.channels ?? [{ id: 7, name: 'primary' }]).map(
        (channel) => ({ ...channel })
      )
      return { data: { success: true, data: { items, total: items.length } } }
    }
    if (url.startsWith('/api/user/search')) {
      const items = (data.users ?? ['alice']).map((username) => ({ username }))
      return { data: { success: true, data: { items, total: items.length } } }
    }
    return { data: { success: true, data: { quota: 0, rpm: 0, tpm: 0 } } }
  })
}

function useMobileViewport() {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query === '(max-width: 640px)',
  }))
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  })
}

async function renderFilter(
  initialEntry = '/usage-logs/common',
  mobile = false
) {
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const logs = createRoute({
    getParentRoute: () => auth,
    path: '/usage-logs/$section',
    component: FilterFixture,
    validateSearch: (search: Record<string, unknown>) => search,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([logs])]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  if (mobile) {
    await userEvent.click(await screen.findByRole('button', { name: /^Filter/ }))
    await screen.findByRole('dialog', { name: 'Filter' })
  } else {
    await screen.findByRole('combobox', { name: 'Model Name' })
  }
  return router
}

async function renderAdminFilter(
  initialEntry = '/usage-logs/common',
  mobile = false
) {
  useAuthStore.getState().auth.setUser(ADMIN_USER)
  const router = await renderFilter(initialEntry, mobile)
  if (!mobile) {
    // 有活动的高级筛选时按钮会附带计数徽标，故只匹配前缀。
    await userEvent.click(screen.getByRole('button', { name: /^Expand/ }))
    await screen.findByRole('combobox', { name: 'Channel ID' })
  }
  return router
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.setUser(null)
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

it('offers the model list as a dropdown and submits the chosen model', async () => {
  mockApi()
  const router = await renderAdminFilter()
  const input = screen.getByRole('combobox', { name: 'Model Name' })
  await userEvent.click(input)
  await userEvent.click(
    await screen.findByRole('option', { name: 'claude-sonnet-5' })
  )
  expect(input).toHaveValue('claude-sonnet-5')
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      model: 'claude-sonnet-5',
      page: 1,
    })
  )
  expect(api.get).toHaveBeenCalledWith('/api/channel/models_enabled')
})

it('falls back to the personal model list outside the administrator view', async () => {
  mockApi({ models: ['personal-model'] })
  const router = await renderFilter()
  await userEvent.click(screen.getByRole('combobox', { name: 'Model Name' }))
  await userEvent.click(
    await screen.findByRole('option', { name: 'personal-model' })
  )
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      model: 'personal-model',
    })
  )
  expect(api.get).toHaveBeenCalledWith('/api/user/models')
  expect(api.get).not.toHaveBeenCalledWith('/api/channel/models_enabled')
})

it('does not submit a model that was typed but never selected', async () => {
  mockApi()
  const router = await renderAdminFilter()
  const input = screen.getByRole('combobox', { name: 'Model Name' })
  await userEvent.click(input)
  await userEvent.type(input, 'gpt')
  // 下拉展开时 Base UI 会把外部内容移出可访问树，先收起再查询工具栏按钮。
  await userEvent.keyboard('{Escape}')
  expect(input).toHaveValue('')
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(router.state.location.search).not.toHaveProperty('model')
  )
})

it('lists channels as #ID name and submits the channel id', async () => {
  mockApi({
    channels: [
      { id: 7, name: 'primary' },
      { id: 42, name: 'backup' },
    ],
  })
  const router = await renderAdminFilter()
  const input = screen.getByRole('combobox', { name: 'Channel ID' })
  await userEvent.click(input)
  expect(await screen.findByRole('option', { name: '#42 backup' })).toBeVisible()
  await userEvent.click(screen.getByRole('option', { name: '#42 backup' }))
  expect(input).toHaveValue('#42 backup')
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({ channel: '42' })
  )
})

it('requests the full channel list instead of the default first page', async () => {
  mockApi()
  await renderAdminFilter()
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      '/api/channel/search',
      expect.objectContaining({
        params: expect.objectContaining({ page_size: 1000 }),
      })
    )
  )
})

it('searches usernames on the server after typing and submits the chosen user', async () => {
  mockApi({ users: ['alice', 'alicia'] })
  const router = await renderAdminFilter()
  const input = screen.getByRole('combobox', { name: 'Username' })
  await userEvent.click(input)
  await userEvent.type(input, 'ali')
  await waitFor(
    () =>
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/user/search?')
      ),
    { timeout: 3000 }
  )
  await userEvent.click(await screen.findByRole('option', { name: 'alicia' }))
  expect(input).toHaveValue('alicia')
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({ username: 'alicia' })
  )
})

it('keeps a username from the URL visible and clears it without typing', async () => {
  mockApi({ users: ['alice'] })
  const router = await renderAdminFilter(
    '/usage-logs/common?username=retired-user'
  )
  const input = screen.getByRole('combobox', { name: 'Username' })
  expect(input).toHaveValue('retired-user')
  await userEvent.click(input)
  // Base UI 给清空按钮设 tabIndex=-1（避免抢走输入框焦点），故查询需含 hidden。
  await userEvent.click(
    screen.getByRole('button', { name: 'Clear', hidden: true })
  )
  await userEvent.keyboard('{Escape}')
  expect(input).toHaveValue('')
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(router.state.location.search).not.toHaveProperty('username')
  )
})

it('hides the channel and username selectors from non-admin users', async () => {
  mockApi()
  await renderFilter()
  await userEvent.click(screen.getByRole('button', { name: /^Expand$/ }))
  expect(
    screen.queryByRole('combobox', { name: 'Channel ID' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('combobox', { name: 'Username' })
  ).not.toBeInTheDocument()
  expect(api.get).not.toHaveBeenCalledWith(
    expect.stringContaining('/api/user/search?')
  )
})

it('shows the empty message when no channel matches', async () => {
  mockApi({ channels: [] })
  await renderAdminFilter()
  await userEvent.click(screen.getByRole('combobox', { name: 'Channel ID' }))
  expect(await screen.findByText('No channel found.')).toBeVisible()
})

it('keeps the three selectors masked together with the other sensitive filters', async () => {
  mockApi()
  await renderAdminFilter()
  await userEvent.click(screen.getByRole('button', { name: /^Hide$/ }))
  for (const name of ['Model Name', 'Channel ID', 'Username']) {
    expect(
      screen.getByRole('combobox', { name }).closest(sensitiveSelector)
    ).not.toBeNull()
  }
  await userEvent.click(screen.getByRole('combobox', { name: 'Channel ID' }))
  const option = await screen.findByRole('option', { name: '#7 primary' })
  expect(option.closest(sensitiveSelector)).not.toBeNull()
})

it('mounts all three selectors inside the mobile filter drawer', async () => {
  useMobileViewport()
  mockApi()
  await renderAdminFilter('/usage-logs/common', true)
  const dialog = screen.getByRole('dialog', { name: 'Filter' })
  for (const name of ['Model Name', 'Channel ID', 'Username']) {
    expect(within(dialog).getByRole('combobox', { name })).toBeVisible()
  }
})
